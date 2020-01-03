import { getLogger } from 'qhsense-meet-logger';

import JitsiParticipant from 'lib-jitsi-meet/JitsiParticipant';

/**
 * Represents a participant in (i.e. a member of) a conference.
 */

export default class QHSenseParticipant extends JitsiParticipant {
    constructor(jid, conference, displayName, hidden, statsID, status, identity) {
        super(jid, conference, displayName, hidden, statsID, status, identity);
    }
    //some functions
}