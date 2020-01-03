
import JitsiMeetJS from 'lib-jitsi-meet';

/**
 * Creates a new connection object for the QHSense Meet server side video
 * conferencing service. Provides access to the QHSenseConference interface.
 * @param appID identification for the provider of QHSense Meet video conferencing
 * services.
 * @param token the JWT token used to authenticate with the server(optional)
 * @param options Object with properties / settings related to connection with
 * the server.
 * @constructor
 */


export default class QHSenseConnection extends JitsiMeetJS.JitsiConnection {
    constructor(appID, token, options) {
        super(appID, token, options);
    }
}
