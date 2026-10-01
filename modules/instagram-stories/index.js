// JS-вхід локального модуля InstagramStories (Swift — у ios/).
// requireOptionalNativeModule повертає null там, де нативної частини немає
// (Android, веб, Expo Go, jest), — без падіння й без червоного екрана.
import { requireOptionalNativeModule } from 'expo';

export default requireOptionalNativeModule('InstagramStories');
