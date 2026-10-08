// JS-вхід локального модуля InstagramStories (Swift — у ios/): isAvailable,
// share (Instagram Stories) і, зі збірки v1.3, copyPng (наліпка PNG у буфер
// з альфою; чи вона є, перевіряє src/share/native.js#canCopyPng).
// requireOptionalNativeModule повертає null там, де нативної частини немає
// (Android, веб, Expo Go, jest), — без падіння й без червоного екрана.
import { requireOptionalNativeModule } from 'expo';

export default requireOptionalNativeModule('InstagramStories');
