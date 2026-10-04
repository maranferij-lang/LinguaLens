# Локальний Expo-модуль: його знаходить автолінкінг (теку modules/ він
# сканує сам), а CocoaPods бере цей podspec. Лише iOS: UIPasteboard зі
# спільними наліпками Instagram на інших платформах немає.
Pod::Spec.new do |s|
  s.name           = 'InstagramStories'
  s.version        = '1.0.0'
  s.summary        = 'Shares LinguaLens stickers and cards to Instagram Stories and the pasteboard'
  s.description    = 'Puts a background or sticker image on the pasteboard and opens Instagram Stories; copies a PNG sticker to the pasteboard as public.png.'
  s.license        = 'MIT'
  s.author         = 'LinguaLens'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
