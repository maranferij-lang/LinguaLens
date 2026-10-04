// Параметри → «Тема»: «Авто», світла й темна. Власник — W5 (кольорові
// палітри Pro). Підпис секції — як у src/settings/WodSection.js.
// Винесено з SettingsScreen.js без зміни поведінки: режим і обробник — з
// пропсів екрана (ctx.props.themeMode, ctx.props.onSetTheme).
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { F, THEME_DEFS } from '../theme';

export default function ThemeSection({ ctx }) {
  const { t, C, s, props } = ctx;
  const { themeMode, onSetTheme } = props;
  return (
    <>
      <Text style={s.sectionLabel}>{t('themeLabel')}</Text>
      {/* Три варіанти замість галереї з восьми. Менше вибору — менше рішень
          для юзера, і кожна тема доведена до ладу, а не «ще один відтінок». */}
      <View style={s.themeRow}>
        {[{ key: 'system', name: t('themeAuto') }, ...THEME_DEFS].map((th) => {
          const active = themeMode === th.key;
          const isAuto = th.key === 'system';
          return (
            <Pressable
              key={th.key}
              style={s.themeCell}
              onPress={() => {
                Haptics.selectionAsync();
                onSetTheme(th.key);
              }}
            >
              <View
                style={[
                  s.swatch,
                  { backgroundColor: isAuto ? '#FAF8F4' : th.swatch },
                  active && { borderColor: C.accent, borderWidth: 2.5 },
                ]}
              >
                {/* «Авто» — половина плитки темна: світло й темрява разом */}
                {isAuto ? <View style={s.swatchHalf} /> : null}
                <View style={[s.swatchDot, { backgroundColor: isAuto ? '#5B4FD6' : th.accent }]} />
              </View>
              <Text style={[s.themeName, active && { color: C.text, fontFamily: F.bold }]} numberOfLines={1}>
                {isAuto ? th.name : t(th.key === 'dark' ? 'themeDark' : 'themeLight')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
