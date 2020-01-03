import JitsiTrackError from 'lib-jitsi-meet/JitsiTrackError';

export default class QHSenseTrackError extends JitsiTrackError {
    constructor(error, options, devices) {
        super(error, options, devices);
    }
}