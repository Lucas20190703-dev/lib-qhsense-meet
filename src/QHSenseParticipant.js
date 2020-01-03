import { getLogger } from 'qhsense-meet-logger';

import JitsiMeetJS from 'lib-jitsi-meet';

/**
 * Represents a participant in (i.e. a member of) a conference.
 */

export default class QHSenseParticipant extends JitsiMeetJS.JitsiParticipant {
    constructor(jid, conference, displayName, hidden, statsID, status, identity) {
        super(jid, conference, displayName, hidden, statsID, status, identity);
    }
    //some functions
}