/* global __filename */

import { getLogger } from 'qhsense-meet-logger';
import * as QHSenseConferenceEvents from '../../QHSenseConferenceEvents';

const logger = getLogger(__filename);

/**
 * Emits {@link QHSenseConferenceEvents.JVB121_STATUS} events based on the current
 * P2P status and the conference participants count. See the event description
 * for more info.
 */
export default class Jvb121EventGenerator {
    /**
     * Creates new <tt>Jvb121EventGenerator</tt> for the given conference.
     * @param {QHSenseConference} conference
     */
    constructor(conference) {
        this._conference = conference;

        /**
         * Indicates whether it's a one to one JVB conference (<tt>true</tt>)
         * or a multiparty (<tt>false</tt>). Will be also <tt>false</tt> if
         * the conference is currently in the P2P mode.
         * @type {boolean}
         * @private
         */
        this._jvb121 = true;

        this._conference.addEventListener(
            QHSenseConferenceEvents.USER_JOINED, () => this.evaluateStatus());
        this._conference.addEventListener(
            QHSenseConferenceEvents.USER_LEFT, () => this.evaluateStatus());
        this._conference.addEventListener(
            QHSenseConferenceEvents.P2P_STATUS, () => this.evaluateStatus());
    }

    /**
     * Checks whether the JVB121 value should be updated and a new event
     * emitted.
     */
    evaluateStatus() {
        const oldStatus = this._jvb121;
        const newStatus
            = !this._conference.isP2PActive()
                && this._conference.getParticipantCount() <= 2;

        if (oldStatus !== newStatus) {
            this._jvb121 = newStatus;
            logger.debug(`JVB121 status ${oldStatus} => ${newStatus}`);
            this._conference.eventEmitter.emit(
                QHSenseConferenceEvents.JVB121_STATUS, oldStatus, newStatus);
        }
    }
}
