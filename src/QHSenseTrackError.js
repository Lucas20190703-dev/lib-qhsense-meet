import JitsiMeetJS from 'lib-jitsi-meet';

export default class QHSenseTrackError extends JitsiMeetJS.JitsiTrackError {
    constructor(error, options, devices) {
        super(error, options, devices);
    }
}