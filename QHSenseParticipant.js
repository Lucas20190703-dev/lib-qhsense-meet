
import { Strophe } from 'strophe.js';

import { getLogger } from 'qhsense-meet-logger';

import * as QHSenseConferenceEvents from './QHSenseConferenceEvents';
import { ParticipantConnectionStatus }
    from './modules/connectivity/ParticipantConnectionStatus';
import * as MediaType from './service/RTC/MediaType';

const logger = getLogger(__filename);

/**
 * Represents a participant in (i.e. a member of) a conference.
 */
export default class QHSenseParticipant {

    /* eslint-disable max-params */

    /**
     * Initializes a new QHSenseParticipant instance.
     *
     * @constructor
     * @param jid the conference XMPP jid
     * @param conference
     * @param displayName
     * @param {Boolean} hidden - True if the new QHSenseParticipant instance is to
     * represent a hidden participant; otherwise, false.
     * @param {string} statsID - optional participant statsID
     * @param {string} status - the initial status if any.
     * @param {object} identity - the xmpp identity
     */
    constructor(jid, conference, displayName, hidden, statsID, status, identity) {
        this._jid = jid;
        this._id = Strophe.getResourceFromJid(jid);
        this._conference = conference;
        this._displayName = displayName;
        this._supportsDTMF = false;
        this._tracks = [];
        this._role = 'none';
        this._status = status;
        this._hidden = hidden;
        this._statsID = statsID;
        this._connectionStatus = ParticipantConnectionStatus.ACTIVE;
        this._properties = {};
        this._identity = identity;
    }

    /* eslint-enable max-params */

    /**
     * @returns {QHSenseConference} The conference that this participant belongs
     * to.
     */
    getConference() {
        return this._conference;
    }

    /**
     * Gets the value of a property of this participant.
     */
    getProperty(name) {
        return this._properties[name];
    }

    /**
     * Checks whether this <tt>QHSenseParticipant</tt> has any video tracks which
     * are muted according to their underlying WebRTC <tt>MediaStreamTrack</tt>
     * muted status.
     * @return {boolean} <tt>true</tt> if this <tt>participant</tt> contains any
     * video <tt>QHSenseTrack</tt>s which are muted as defined in
     * {@link QHSenseTrack.isWebRTCTrackMuted}.
     */
    hasAnyVideoTrackWebRTCMuted() {
        return (
            this.getTracks().some(
                QHSenseTrack =>
                    QHSenseTrack.getType() === MediaType.VIDEO
                        && QHSenseTrack.isWebRTCTrackMuted()));
    }

    /**
     * Updates participant's connection status.
     * @param {string} state the current participant connection state.
     * {@link ParticipantConnectionStatus}.
     * @private
     */
    _setConnectionStatus(status) {
        this._connectionStatus = status;
    }

    /**
     * Return participant's connectivity status.
     *
     * @returns {string} the connection status
     * <tt>ParticipantConnectionStatus</tt> of the user.
     * {@link ParticipantConnectionStatus}.
     */
    getConnectionStatus() {
        return this._connectionStatus;
    }

    /**
     * Sets the value of a property of this participant, and fires an event if
     * the value has changed.
     * @name the name of the property.
     * @value the value to set.
     */
    setProperty(name, value) {
        const oldValue = this._properties[name];

        if (value !== oldValue) {
            this._properties[name] = value;
            this._conference.eventEmitter.emit(
                QHSenseConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
                this,
                name,
                oldValue,
                value);
        }
    }

    /**
     * @returns {Array.<QHSenseTrack>} The list of media tracks for this
     * participant.
     */
    getTracks() {
        return this._tracks.slice();
    }

    /**
     * @param {MediaType} mediaType
     * @returns {Array.<QHSenseTrack>} an array of media tracks for this
     * participant, for given media type.
     */
    getTracksByMediaType(mediaType) {
        return this.getTracks().filter(track => track.getType() === mediaType);
    }

    /**
     * @returns {String} The ID of this participant.
     */
    getId() {
        return this._id;
    }

    /**
     * @returns {String} The JID of this participant.
     */
    getJid() {
        return this._jid;
    }

    /**
     * @returns {String} The human-readable display name of this participant.
     */
    getDisplayName() {
        return this._displayName;
    }

    /**
     * @returns {String} The stats ID of this participant.
     */
    getStatsID() {
        return this._statsID;
    }

    /**
     * @returns {String} The status of the participant.
     */
    getStatus() {
        return this._status;
    }

    /**
     * @returns {Boolean} Whether this participant is a moderator or not.
     */
    isModerator() {
        return this._role === 'moderator';
    }

    /**
     * @returns {Boolean} Whether this participant is a hidden participant. Some
     * special system participants may want to join hidden (like for example the
     * recorder).
     */
    isHidden() {
        return this._hidden;
    }

    /**
     * @returns {Boolean} Whether this participant has muted their audio.
     */
    isAudioMuted() {
        return this._isMediaTypeMuted(MediaType.AUDIO);
    }

    /**
     * Determines whether all QHSenseTracks which are of a specific MediaType and
     * which belong to this QHSenseParticipant are muted.
     *
     * @param {MediaType} mediaType - The MediaType of the QHSenseTracks to be
     * checked.
     * @private
     * @returns {Boolean} True if all QHSenseTracks which are of the specified
     * mediaType and which belong to this QHSenseParticipant are muted; otherwise,
     * false.
     */
    _isMediaTypeMuted(mediaType) {
        return this.getTracks().reduce(
            (muted, track) =>
                muted && (track.getType() !== mediaType || track.isMuted()),
            true);
    }

    /**
     * @returns {Boolean} Whether this participant has muted their video.
     */
    isVideoMuted() {
        return this._isMediaTypeMuted(MediaType.VIDEO);
    }

    /**
     * @returns {String} The role of this participant.
     */
    getRole() {
        return this._role;
    }

    /**
     *
     */
    supportsDTMF() {
        return this._supportsDTMF;
    }

    /**
     * Returns a set with the features for the participant.
     * @param {int} timeout the timeout in ms for reply from the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeatures(timeout = 5000) {
        return this._conference.xmpp.caps.getFeatures(this._jid, timeout)
            .catch(error => {
                // when we detect version mismatch we return a string as error
                // we want to retry in such case
                if (error && error.constructor === String) {
                    return this._conference.xmpp.caps.getFeatures(this._jid, timeout);
                }

                logger.warn(`Failed to discover features of ${this._jid}`, error);

                return Promise.reject(error);
            });
    }

    /**
     * Returns the bot type for the participant.
     *
     * @returns {string|undefined} - The bot type of the participant.
     */
    getBotType() {
        return this._botType;
    }
}
