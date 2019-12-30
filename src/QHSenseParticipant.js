
import { Strophe } from 'strophe.js';

import { getLogger } from 'qhsense-meet-logger';

import * as QHSenseConferenceEvents from './QHSenseConferenceEvents';
import { ParticipantConnectionStatus }
    from './modules/connectivity/ParticipantConnectionStatus';
import * as MediaType from './service/RTC/MediaType';
import JitsiParticipant from 'lib-jitsi-meet/JitsiParticipant';

const logger = getLogger(__filename);

/**
 * Represents a participant in (i.e. a member of) a conference.
 */

export default class QHSenseParticipant extends JitsiParticipant {
    constructor(jid, conference, displayName, hidden, statsID, status, identity) {
        super(jid, conference, displayName, hidden, statsID, status, identity);
    }
    //some functions
}