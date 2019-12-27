/* global __filename */
import { Strophe } from 'strophe.js';

import {
    ACTION_JINGLE_SA_TIMEOUT,
    createBridgeDownEvent,
    createConnectionStageReachedEvent,
    createFocusLeftEvent,
    createJingleEvent,
    createRemotelyMutedEvent
} from './service/statistics/AnalyticsEvents';
import AuthenticationEvents
    from './service/authentication/AuthenticationEvents';
import EventEmitterForwarder from './modules/util/EventEmitterForwarder';
import { getLogger } from 'qhsense-meet-logger';
import * as QHSenseConferenceErrors from './QHSenseConferenceErrors';
import * as QHSenseConferenceEvents from './QHSenseConferenceEvents';
import * as MediaType from './service/RTC/MediaType';
import RTCEvents from './service/RTC/RTCEvents';
import VideoType from './service/RTC/VideoType';
import Statistics from './modules/statistics/statistics';
import XMPPEvents from './service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

/**
 * Setups all event listeners related to conference
 * @param conference {QHSenseConference} the conference
 */
export default function QHSenseConferenceEventManager(conference) {
    this.conference = conference;
    this.xmppListeners = {};

    // Listeners related to the conference only
    conference.on(QHSenseConferenceEvents.TRACK_MUTE_CHANGED,
        track => {
            if (!track.isLocal() || !conference.statistics) {
                return;
            }
            const session
                = track.isP2P
                    ? conference.p2pJingleSession : conference.jvbJingleSession;

            // TPC will be null, before the conference starts, but the event
            // still should be queued
            const tpc = (session && session.peerconnection) || null;

            conference.statistics.sendMuteEvent(
                tpc,
                track.isMuted(),
                track.getType());
        });
}

/**
 * Setups event listeners related to conference.chatRoom
 */
QHSenseConferenceEventManager.prototype.setupChatRoomListeners = function() {
    const conference = this.conference;
    const chatRoom = conference.room;

    this.chatRoomForwarder = new EventEmitterForwarder(chatRoom,
        this.conference.eventEmitter);

    chatRoom.addListener(XMPPEvents.ICE_RESTARTING, jingleSession => {
        if (!jingleSession.isP2P) {
            // If using DataChannel as bridge channel, it must be closed
            // before ICE restart, otherwise Chrome will not trigger "opened"
            // event for the channel established with the new bridge.
            // TODO: This may be bypassed when using a WebSocket as bridge
            // channel.
            conference.rtc.closeBridgeChannel();
        }

        // else: there are no DataChannels in P2P session (at least for now)
    });

    chatRoom.addListener(
        XMPPEvents.ICE_RESTART_SUCCESS,
        (jingleSession, offerIq) => {
            // The JVB data chanel needs to be reopened in case the conference
            // has been moved to a new bridge.
            !jingleSession.isP2P
                && conference._setBridgeChannel(
                    offerIq, jingleSession.peerconnection);
        });


    chatRoom.addListener(XMPPEvents.AUDIO_MUTED_BY_FOCUS,
        actor => {
            // TODO: Add a way to differentiate between commands which caused
            // us to mute and those that did not change our state (i.e. we were
            // already muted).
            Statistics.sendAnalytics(createRemotelyMutedEvent());

            conference.mutedByFocusActor = actor;

            // set isMutedByFocus when setAudioMute Promise ends
            conference.rtc.setAudioMute(true).then(
                () => {
                    conference.isMutedByFocus = true;
                    conference.mutedByFocusActor = null;
                })
                .catch(
                    error => {
                        conference.mutedByFocusActor = null;
                        logger.warn(
                            'Error while audio muting due to focus request', error);
                    });
        }
    );

    this.chatRoomForwarder.forward(XMPPEvents.SUBJECT_CHANGED,
        QHSenseConferenceEvents.SUBJECT_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.MUC_JOINED,
        QHSenseConferenceEvents.CONFERENCE_JOINED);

    // send some analytics events
    chatRoom.addListener(XMPPEvents.MUC_JOINED,
        () => {
            this.conference.isJvbConnectionInterrupted = false;

            // TODO: Move all of the 'connectionTimes' logic to its own module.
            Object.keys(chatRoom.connectionTimes).forEach(key => {
                const event
                    = createConnectionStageReachedEvent(
                        `conference_${key}`,
                        { value: chatRoom.connectionTimes[key] });

                Statistics.sendAnalytics(event);
            });

            // TODO: Move all of the 'connectionTimes' logic to its own module.
            Object.keys(chatRoom.xmpp.connectionTimes).forEach(key => {
                const event
                    = createConnectionStageReachedEvent(
                        `xmpp_${key}`,
                        { value: chatRoom.xmpp.connectionTimes[key] });

                Statistics.sendAnalytics(event);
            });
        });

    chatRoom.addListener(XMPPEvents.RENEGOTIATION_FAILED, (e, session) => {
        if (!session.isP2P) {
            conference.eventEmitter.emit(QHSenseConferenceEvents.CONFERENCE_FAILED,
                QHSenseConferenceErrors.OFFER_ANSWER_FAILED, e);
        }
    });

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_JOIN_ERROR,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.CONNECTION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_ERROR,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.CONNECTION_ERROR);
    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.NOT_ALLOWED_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_MAX_USERS_ERROR,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.CONFERENCE_MAX_USERS);

    this.chatRoomForwarder.forward(XMPPEvents.PASSWORD_REQUIRED,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.PASSWORD_REQUIRED);

    this.chatRoomForwarder.forward(XMPPEvents.AUTHENTICATION_REQUIRED,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.AUTHENTICATION_REQUIRED);

    this.chatRoomForwarder.forward(XMPPEvents.BRIDGE_DOWN,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.VIDEOBRIDGE_NOT_AVAILABLE);
    chatRoom.addListener(
        XMPPEvents.BRIDGE_DOWN,
        () => Statistics.sendAnalytics(createBridgeDownEvent()));

    this.chatRoomForwarder.forward(XMPPEvents.RESERVATION_ERROR,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.RESERVATION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.GRACEFUL_SHUTDOWN,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.GRACEFUL_SHUTDOWN);

    chatRoom.addListener(XMPPEvents.CONNECTION_ICE_FAILED,
        jingleSession => {
            conference._onIceConnectionFailed(jingleSession);
        });

    this.chatRoomForwarder.forward(XMPPEvents.MUC_DESTROYED,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.CONFERENCE_DESTROYED);

    this.chatRoomForwarder.forward(XMPPEvents.CHAT_ERROR_RECEIVED,
        QHSenseConferenceEvents.CONFERENCE_ERROR,
        QHSenseConferenceErrors.CHAT_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.FOCUS_DISCONNECTED,
        QHSenseConferenceEvents.CONFERENCE_FAILED,
        QHSenseConferenceErrors.FOCUS_DISCONNECTED);

    chatRoom.addListener(XMPPEvents.FOCUS_LEFT,
        () => {
            Statistics.sendAnalytics(createFocusLeftEvent());
            conference.eventEmitter.emit(
                QHSenseConferenceEvents.CONFERENCE_FAILED,
                QHSenseConferenceErrors.FOCUS_LEFT);
        });

    chatRoom.addListener(XMPPEvents.SESSION_ACCEPT_TIMEOUT,
        jingleSession => {
            Statistics.sendAnalyticsAndLog(
                createJingleEvent(
                    ACTION_JINGLE_SA_TIMEOUT,
                    { p2p: jingleSession.isP2P }));
        });

    this.chatRoomForwarder.forward(XMPPEvents.RECORDER_STATE_CHANGED,
        QHSenseConferenceEvents.RECORDER_STATE_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.TRANSCRIPTION_STATUS_CHANGED,
        QHSenseConferenceEvents.TRANSCRIPTION_STATUS_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED,
        QHSenseConferenceEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED);

    this.chatRoomForwarder.forward(
        XMPPEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED,
        QHSenseConferenceEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.PHONE_NUMBER_CHANGED,
        QHSenseConferenceEvents.PHONE_NUMBER_CHANGED);

    chatRoom.setParticipantPropertyListener((node, from) => {
        const participant = conference.getParticipantById(from);

        if (!participant) {
            return;
        }

        participant.setProperty(
            node.tagName.substring('QHSense_participant_'.length),
            node.value);
    });

    chatRoom.addListener(XMPPEvents.KICKED,
        conference.onMemberKicked.bind(conference));
    chatRoom.addListener(XMPPEvents.SUSPEND_DETECTED,
        conference.onSuspendDetected.bind(conference));

    this.chatRoomForwarder.forward(XMPPEvents.MUC_LOCK_CHANGED,
        QHSenseConferenceEvents.LOCK_STATE_CHANGED);

    chatRoom.addListener(XMPPEvents.MUC_MEMBER_JOINED,
        conference.onMemberJoined.bind(conference));
    chatRoom.addListener(XMPPEvents.MUC_MEMBER_BOT_TYPE_CHANGED,
        conference._onMemberBotTypeChanged.bind(conference));
    chatRoom.addListener(XMPPEvents.MUC_MEMBER_LEFT,
        conference.onMemberLeft.bind(conference));
    this.chatRoomForwarder.forward(XMPPEvents.MUC_LEFT,
        QHSenseConferenceEvents.CONFERENCE_LEFT);

    chatRoom.addListener(XMPPEvents.DISPLAY_NAME_CHANGED,
        conference.onDisplayNameChanged.bind(conference));

    chatRoom.addListener(XMPPEvents.LOCAL_ROLE_CHANGED, role => {
        conference.onLocalRoleChanged(role);

        // log all events for the recorder operated by the moderator
        if (conference.statistics && conference.isModerator()) {
            conference.on(QHSenseConferenceEvents.RECORDER_STATE_CHANGED,
                recorderSession => {
                    const logObject = {
                        error: recorderSession.getError(),
                        id: 'recorder_status',
                        status: recorderSession.getStatus()
                    };

                    Statistics.sendLog(JSON.stringify(logObject));
                });
        }
    });

    chatRoom.addListener(XMPPEvents.MUC_ROLE_CHANGED,
        conference.onUserRoleChanged.bind(conference));

    chatRoom.addListener(AuthenticationEvents.IDENTITY_UPDATED,
        (authEnabled, authIdentity) => {
            conference.authEnabled = authEnabled;
            conference.authIdentity = authIdentity;
            conference.eventEmitter.emit(
                QHSenseConferenceEvents.AUTH_STATUS_CHANGED, authEnabled,
                authIdentity);
        });

    chatRoom.addListener(
        XMPPEvents.MESSAGE_RECEIVED,

        // eslint-disable-next-line max-params
        (jid, displayName, txt, myJid, ts) => {
            const id = Strophe.getResourceFromJid(jid);

            conference.eventEmitter.emit(
                QHSenseConferenceEvents.MESSAGE_RECEIVED,
                id, txt, ts);
        });

    chatRoom.addListener(
        XMPPEvents.PRIVATE_MESSAGE_RECEIVED,

        // eslint-disable-next-line max-params
        (jid, displayName, txt, myJid, ts) => {
            const id = Strophe.getResourceFromJid(jid);

            conference.eventEmitter.emit(
                QHSenseConferenceEvents.PRIVATE_MESSAGE_RECEIVED,
                id, txt, ts);
        });

    chatRoom.addListener(XMPPEvents.PRESENCE_STATUS,
        (jid, status) => {
            const id = Strophe.getResourceFromJid(jid);
            const participant = conference.getParticipantById(id);

            if (!participant || participant._status === status) {
                return;
            }
            participant._status = status;
            conference.eventEmitter.emit(
                QHSenseConferenceEvents.USER_STATUS_CHANGED, id, status);
        });

    chatRoom.addListener(XMPPEvents.JSON_MESSAGE_RECEIVED,
        (from, payload) => {
            const id = Strophe.getResourceFromJid(from);
            const participant = conference.getParticipantById(id);

            if (participant) {
                conference.eventEmitter.emit(
                    QHSenseConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
                    participant, payload);
            } else {
                logger.warn(
                    'Ignored XMPPEvents.JSON_MESSAGE_RECEIVED for not existing '
                    + `participant: ${from}`,
                    payload);
            }
        });

    chatRoom.addPresenceListener('startmuted', (data, from) => {
        let isModerator = false;

        if (conference.myUserId() === from && conference.isModerator()) {
            isModerator = true;
        } else {
            const participant = conference.getParticipantById(from);

            if (participant && participant.isModerator()) {
                isModerator = true;
            }
        }

        if (!isModerator) {
            return;
        }

        const startAudioMuted = data.attributes.audio === 'true';
        const startVideoMuted = data.attributes.video === 'true';

        let updated = false;

        if (startAudioMuted !== conference.startMutedPolicy.audio) {
            conference.startMutedPolicy.audio = startAudioMuted;
            updated = true;
        }

        if (startVideoMuted !== conference.startMutedPolicy.video) {
            conference.startMutedPolicy.video = startVideoMuted;
            updated = true;
        }

        if (updated) {
            conference.eventEmitter.emit(
                QHSenseConferenceEvents.START_MUTED_POLICY_CHANGED,
                conference.startMutedPolicy
            );
        }
    });

    if (conference.statistics) {
        // FIXME ICE related events should end up in RTCEvents eventually
        chatRoom.addListener(XMPPEvents.CONNECTION_ICE_FAILED,
            session => {
                conference.statistics.sendIceConnectionFailedEvent(
                    session.peerconnection);
            });

        // FIXME XMPPEvents.ADD_ICE_CANDIDATE_FAILED is never emitted
        chatRoom.addListener(XMPPEvents.ADD_ICE_CANDIDATE_FAILED,
            (e, pc) => {
                conference.statistics.sendAddIceCandidateFailed(e, pc);
            });
    }
};

/**
 * Setups event listeners related to conference.rtc
 */
QHSenseConferenceEventManager.prototype.setupRTCListeners = function() {
    const conference = this.conference;
    const rtc = conference.rtc;

    rtc.addListener(
        RTCEvents.REMOTE_TRACK_ADDED,
        conference.onRemoteTrackAdded.bind(conference));

    rtc.addListener(
        RTCEvents.REMOTE_TRACK_REMOVED,
        conference.onRemoteTrackRemoved.bind(conference));

    rtc.addListener(RTCEvents.DOMINANT_SPEAKER_CHANGED,
        id => {
            if (conference.lastDominantSpeaker !== id && conference.room) {
                conference.lastDominantSpeaker = id;
                conference.eventEmitter.emit(
                    QHSenseConferenceEvents.DOMINANT_SPEAKER_CHANGED, id);
            }
            if (conference.statistics && conference.myUserId() === id) {
                // We are the new dominant speaker.
                conference.statistics.sendDominantSpeakerEvent(
                    conference.room.roomjid);
            }
        });

    rtc.addListener(RTCEvents.DATA_CHANNEL_OPEN, () => {
        const now = window.performance.now();
        const key = 'data.channel.opened';

        // TODO: Move all of the 'connectionTimes' logic to its own module.
        logger.log(`(TIME) ${key}`, now);
        conference.room.connectionTimes[key] = now;
        Statistics.sendAnalytics(
            createConnectionStageReachedEvent(key, { value: now }));

        conference.eventEmitter.emit(QHSenseConferenceEvents.DATA_CHANNEL_OPENED);
    });

    rtc.addListener(RTCEvents.ENDPOINT_MESSAGE_RECEIVED,
        (from, payload) => {
            const participant = conference.getParticipantById(from);

            if (participant) {
                conference.eventEmitter.emit(
                    QHSenseConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
                    participant, payload);
            } else {
                logger.warn(
                    'Ignored ENDPOINT_MESSAGE_RECEIVED for not existing '
                        + `participant: ${from}`,
                    payload);
            }
        });

    rtc.addListener(RTCEvents.LOCAL_UFRAG_CHANGED,
        (tpc, ufrag) => {
            if (!tpc.isP2P) {
                Statistics.sendLog(
                    JSON.stringify({
                        id: 'local_ufrag',
                        value: ufrag
                    }));
            }
        });
    rtc.addListener(RTCEvents.REMOTE_UFRAG_CHANGED,
        (tpc, ufrag) => {
            if (!tpc.isP2P) {
                Statistics.sendLog(
                    JSON.stringify({
                        id: 'remote_ufrag',
                        value: ufrag
                    }));
            }
        });

    rtc.addListener(RTCEvents.CREATE_ANSWER_FAILED,
        (e, tpc) => {
            conference.statistics.sendCreateAnswerFailed(e, tpc);
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(QHSenseConferenceEvents.CONFERENCE_FAILED,
                    QHSenseConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });

    rtc.addListener(RTCEvents.CREATE_OFFER_FAILED,
        (e, tpc) => {
            conference.statistics.sendCreateOfferFailed(e, tpc);
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(QHSenseConferenceEvents.CONFERENCE_FAILED,
                    QHSenseConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });

    rtc.addListener(RTCEvents.SET_LOCAL_DESCRIPTION_FAILED,
        (e, tpc) => {
            conference.statistics.sendSetLocalDescFailed(e, tpc);
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(QHSenseConferenceEvents.CONFERENCE_FAILED,
                    QHSenseConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });

    rtc.addListener(RTCEvents.SET_REMOTE_DESCRIPTION_FAILED,
        (e, tpc) => {
            conference.statistics.sendSetRemoteDescFailed(e, tpc);
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(QHSenseConferenceEvents.CONFERENCE_FAILED,
                    QHSenseConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });

    rtc.addListener(RTCEvents.LOCAL_TRACK_SSRC_UPDATED,
        (track, ssrc) => {
            // when starting screen sharing, the track is created and when
            // we do set local description and we process the ssrc we
            // will be notified for it and we will report it with the event
            // for screen sharing
            if (track.isVideoTrack() && track.videoType === VideoType.DESKTOP) {
                conference.statistics.sendScreenSharingEvent(true, ssrc);
            }
        });
};

/**
 * Removes event listeners related to conference.xmpp
 */
QHSenseConferenceEventManager.prototype.removeXMPPListeners = function() {
    const conference = this.conference;

    conference.xmpp.caps.removeListener(
        XMPPEvents.PARTCIPANT_FEATURES_CHANGED,
        this.xmppListeners[XMPPEvents.PARTCIPANT_FEATURES_CHANGED]);
    delete this.xmppListeners[XMPPEvents.PARTCIPANT_FEATURES_CHANGED];

    Object.keys(this.xmppListeners).forEach(eventName => {
        conference.xmpp.removeListener(
            eventName,
            this.xmppListeners[eventName]);
    });
    this.xmppListeners = {};
};


/**
 * Setups event listeners related to conference.xmpp
 */
QHSenseConferenceEventManager.prototype.setupXMPPListeners = function() {
    const conference = this.conference;

    const featuresChangedListener = from => {
        const participant
            = conference.getParticipantById(
            Strophe.getResourceFromJid(from));

        if (participant) {
            conference.eventEmitter.emit(
                QHSenseConferenceEvents.PARTCIPANT_FEATURES_CHANGED,
                participant);
        }
    };

    conference.xmpp.caps.addListener(
        XMPPEvents.PARTCIPANT_FEATURES_CHANGED,
        featuresChangedListener);
    this.xmppListeners[XMPPEvents.PARTCIPANT_FEATURES_CHANGED]
        = featuresChangedListener;

    this._addConferenceXMPPListener(
        XMPPEvents.CALL_INCOMING,
        conference.onIncomingCall.bind(conference));
    this._addConferenceXMPPListener(
        XMPPEvents.CALL_ACCEPTED,
        conference.onCallAccepted.bind(conference));
    this._addConferenceXMPPListener(
        XMPPEvents.TRANSPORT_INFO,
        conference.onTransportInfo.bind(conference));
    this._addConferenceXMPPListener(
        XMPPEvents.CALL_ENDED,
        conference.onCallEnded.bind(conference));

    this._addConferenceXMPPListener(XMPPEvents.START_MUTED_FROM_FOCUS,
        (audioMuted, videoMuted) => {
            if (conference.options.config.ignoreStartMuted) {
                return;
            }

            conference.startAudioMuted = audioMuted;
            conference.startVideoMuted = videoMuted;

            // mute existing local tracks because this is initial mute from
            // Jicofo
            conference.getLocalTracks().forEach(track => {
                switch (track.getType()) {
                case MediaType.AUDIO:
                    conference.startAudioMuted && track.mute();
                    break;
                case MediaType.VIDEO:
                    conference.startVideoMuted && track.mute();
                    break;
                }
            });

            conference.eventEmitter.emit(QHSenseConferenceEvents.STARTED_MUTED);
        });
};

/**
 * Add XMPP listener and save its reference for remove on leave conference.
 */
QHSenseConferenceEventManager.prototype._addConferenceXMPPListener = function(
        eventName, listener) {
    this.xmppListeners[eventName] = listener;
    this.conference.xmpp.addListener(eventName, listener);
};

/**
 * Setups event listeners related to conference.statistics
 */
QHSenseConferenceEventManager.prototype.setupStatisticsListeners = function() {
    const conference = this.conference;

    if (!conference.statistics) {
        return;
    }

    /* eslint-disable max-params */
    conference.statistics.addAudioLevelListener((tpc, ssrc, level, isLocal) => {
        conference.rtc.setAudioLevel(tpc, ssrc, level, isLocal);
    });

    /* eslint-enable max-params */

    // Forward the "before stats disposed" event
    conference.statistics.addBeforeDisposedListener(() => {
        conference.eventEmitter.emit(
            QHSenseConferenceEvents.BEFORE_STATISTICS_DISPOSED);
    });

    // if we are in startSilent mode we will not be sending/receiving so nothing to detect
    if (!conference.options.config.startSilent) {
        conference.statistics.addByteSentStatsListener((tpc, stats) => {
            conference.getLocalTracks(MediaType.AUDIO).forEach(track => {
                const ssrc = tpc.getLocalSSRC(track);

                if (!ssrc || !stats.hasOwnProperty(ssrc)) {
                    return;
                }

                track._onByteSentStatsReceived(tpc, stats[ssrc]);
            });
        });
    }
};
