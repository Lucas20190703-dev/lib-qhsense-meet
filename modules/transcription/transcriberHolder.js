/**
 * This objets holds all created transcriberHolders so that they can be
 * accessed through the QHSenseMeetJS object.
 *
 * This is probably temporary until there is a better way to expose the
 * Transcriber in a conference
 */
const transcriberHolder = {
    transcribers: [],

    add(transcriber) {
        transcriberHolder.transcribers.push(transcriber);
    }
};

module.exports = transcriberHolder;
