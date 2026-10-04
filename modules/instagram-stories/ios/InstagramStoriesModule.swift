import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

// Що JS передає в share(): локальні PNG (file://) і кольори тла "#RRGGBB".
struct StoriesShareOptions: Record {
  @Field var appId: String = ""
  @Field var backgroundImage: URL?
  @Field var stickerImage: URL?
  @Field var topColor: String?
  @Field var bottomColor: String?
}

// «Поділитися в Instagram Stories» за схемою Meta: картинки кладемо в
// буфер обміну під ключами com.instagram.sharedSticker.*, і відкриваємо
// instagram-stories://share. Instagram сам забирає їх із буфера. З 2023 року
// без source_application (App ID застосунку Meta) він відкриває порожній редактор.
public class InstagramStoriesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InstagramStories")

    // canOpenURL каже правду лише для схем із LSApplicationQueriesSchemes
    // (app.json → ios.infoPlist) і лише з головного потоку.
    AsyncFunction("isAvailable") { () -> Bool in
      guard let url = InstagramStoriesModule.storiesURL(appId: "") else {
        return false
      }
      return UIApplication.shared.canOpenURL(url)
    }
    .runOnQueue(.main)

    // false — нема чим ділитися, Instagram не встановлено або не відкрився.
    AsyncFunction("share") { (options: StoriesShareOptions, promise: Promise) in
      var item: [String: Any] = [:]
      if let url = options.backgroundImage, let data = try? Data(contentsOf: url) {
        item["com.instagram.sharedSticker.backgroundImage"] = data
      }
      if let url = options.stickerImage, let data = try? Data(contentsOf: url) {
        item["com.instagram.sharedSticker.stickerImage"] = data
      }
      guard !item.isEmpty,
            !options.appId.isEmpty,
            let url = InstagramStoriesModule.storiesURL(appId: options.appId),
            UIApplication.shared.canOpenURL(url) else {
        promise.resolve(false)
        return
      }
      if let top = options.topColor {
        item["com.instagram.sharedSticker.backgroundTopColor"] = top
      }
      if let bottom = options.bottomColor {
        item["com.instagram.sharedSticker.backgroundBottomColor"] = bottom
      }
      // П'ять хвилин вистачає, щоб Instagram відкрився й забрав картинку;
      // довше вона не має висіти в буфері, звідки її вставив би будь-хто.
      UIPasteboard.general.setItems([item], options: [.expirationDate: Date().addingTimeInterval(5 * 60)])
      UIApplication.shared.open(url, options: [:]) { opened in
        promise.resolve(opened)
      }
    }
    .runOnQueue(.main)

    // «Копіювати» в аркуші наліпок: кладемо в буфер самі байти PNG під типом
    // public.png. UIPasteboard.general.image (так робить expo-clipboard)
    // перекодовує UIImage і може віддати її JPEG-ом — тоді прозоре тло
    // наліпки стало б білим чи чорним. Байти файлу view-shot ідуть як є, з
    // альфою. Без строку дії: людина вставляє наліпку тоді, коли сама захоче.
    // false — файлу немає або він порожній.
    AsyncFunction("copyPng") { (url: URL) -> Bool in
      guard let data = try? Data(contentsOf: url), !data.isEmpty else {
        return false
      }
      UIPasteboard.general.setItems([[UTType.png.identifier: data]])
      return true
    }
    .runOnQueue(.main)
  }

  private static func storiesURL(appId: String) -> URL? {
    var components = URLComponents()
    components.scheme = "instagram-stories"
    components.host = "share"
    if !appId.isEmpty {
      components.queryItems = [URLQueryItem(name: "source_application", value: appId)]
    }
    return components.url
  }
}
