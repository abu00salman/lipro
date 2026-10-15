import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable {
    case system, arabic, english
    var id: String { rawValue }
}

enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

/// اختيار النص واللغة: يقرأ الإعداد المحفوظ من داخل التطبيق، وإن كان "تلقائي" يتبع الجهاز
enum L10n {
    static var language: AppLanguage {
        AppLanguage(rawValue: UserDefaults.standard.string(forKey: "appLanguage") ?? "") ?? .system
    }

    static var isEnglish: Bool {
        switch language {
        case .english: true
        case .arabic: false
        case .system: Locale.current.language.languageCode?.identifier == "en"
        }
    }

    static var locale: Locale {
        switch language {
        case .english: Locale(identifier: "en")
        case .arabic: Locale(identifier: "ar")
        case .system: .current
        }
    }

    static func pick(_ arabic: String, _ english: String) -> String {
        isEnglish ? english : arabic
    }
}

@MainActor
@Observable
final class AppSettings {
    var language: AppLanguage {
        didSet { UserDefaults.standard.set(language.rawValue, forKey: "appLanguage") }
    }

    var appearance: AppAppearance {
        didSet { UserDefaults.standard.set(appearance.rawValue, forKey: "appAppearance") }
    }

    init() {
        let defaults = UserDefaults.standard
        language = AppLanguage(rawValue: defaults.string(forKey: "appLanguage") ?? "") ?? .system
        appearance = AppAppearance(rawValue: defaults.string(forKey: "appAppearance") ?? "") ?? .system
    }
}
