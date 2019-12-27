import EventEmitter from 'events';
import QHSenseConference from '../../QHSenseConference';
import * as QHSenseConferenceEvents from '../../QHSenseConferenceEvents';
import QHSenseParticipant from '../../QHSenseParticipant';
import SpeakerStats from './SpeakerStats';
import SpeakerStatsCollector from './SpeakerStatsCollector';

const mockMyId = 1;
const mockRemoteUser = {
    id: 2,
    name: 'foo'
};

/**
 * Mock object to be used in place of a real conference.
 *
 * @constructor
 */
function MockConference() {
    this.eventEmitter = new EventEmitter();
}
MockConference.prototype = Object.create(QHSenseConference.prototype);
MockConference.prototype.constructor = QHSenseConference;

/**
 * Mock object to be used in place of a real QHSenseParticipant.
 *
 * @constructor
 * @param {string|number} id - An id for the mock user.
 * @param {string} name - A name for the mock user.
 * @returns {void}
 */
function MockQHSenseParticipant(id, name) {
    this._jid = id;
    this._displayName = name;
}
MockQHSenseParticipant.prototype = Object.create(QHSenseParticipant.prototype);
MockQHSenseParticipant.prototype.constructor = QHSenseParticipant;

describe('SpeakerStatsCollector', () => {
    let mockConference, speakerStatsCollector;

    beforeEach(() => {
        mockConference = new MockConference();
        spyOn(mockConference, 'myUserId').and.returnValue(mockMyId);

        speakerStatsCollector = new SpeakerStatsCollector(mockConference);

        mockConference.eventEmitter.emit(
            QHSenseConferenceEvents.USER_JOINED,
            mockRemoteUser.id,
            new MockQHSenseParticipant(mockRemoteUser.id, mockRemoteUser.name)
        );
    });

    it('automatically adds the current user', () => {
        const stats = speakerStatsCollector.getStats();
        const currentUserStats = stats[mockMyId];

        expect(currentUserStats instanceof SpeakerStats).toBe(true);
    });

    it('adds joined users to the stats', () => {
        const stats = speakerStatsCollector.getStats();
        const remoteUserStats = stats[mockRemoteUser.id];

        expect(remoteUserStats).toBeTruthy();
        expect(remoteUserStats instanceof SpeakerStats).toBe(true);
        expect(remoteUserStats.getDisplayName()).toBe(mockRemoteUser.name);
    });

    describe('on user name change', () => {
        it('updates the username', () => {
            const newName = `new-${mockRemoteUser.name}`;

            mockConference.eventEmitter.emit(
                QHSenseConferenceEvents.DISPLAY_NAME_CHANGED,
                mockRemoteUser.id,
                newName
            );

            const stats = speakerStatsCollector.getStats();
            const remoteUserStats = stats[mockRemoteUser.id];

            expect(remoteUserStats.getDisplayName()).toBe(newName);
        });
    });

    describe('on user leave', () => {
        it('retains the user stats but marks the user as left', () => {
            mockConference.eventEmitter.emit(
                QHSenseConferenceEvents.USER_LEFT,
                mockRemoteUser.id
            );

            const stats = speakerStatsCollector.getStats();
            const remoteUserStats = stats[mockRemoteUser.id];

            expect(remoteUserStats.hasLeft()).toBe(true);
        });
    });

    describe('on dominant speaker change', () => {
        it('updates models to reflect the new dominant speaker', () => {
            const stats = speakerStatsCollector.getStats();
            const remoteUserStats = stats[mockRemoteUser.id];
            const currentUserStats = stats[mockMyId];

            mockConference.eventEmitter.emit(
                QHSenseConferenceEvents.DOMINANT_SPEAKER_CHANGED,
                mockRemoteUser.id
            );

            expect(remoteUserStats.isDominantSpeaker()).toBe(true);
            expect(currentUserStats.isDominantSpeaker()).toBe(false);

            mockConference.eventEmitter.emit(
                QHSenseConferenceEvents.DOMINANT_SPEAKER_CHANGED,
                mockMyId
            );

            expect(remoteUserStats.isDominantSpeaker()).toBe(false);
            expect(currentUserStats.isDominantSpeaker()).toBe(true);
        });
    });
});
