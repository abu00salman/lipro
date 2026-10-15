import SwiftUI
import UIKit

enum Theme {
    static let pitch = Color(hex: 0x04322C)
    static let teal = Color(hex: 0x0E7A6B)
    static let gold = Color(hex: 0xF5B325)
    static let chalk = Color(hex: 0xEFF4F1)

    /// نص بلون ليبرو يتكيّف مع الوضع الفاتح والداكن
    static let tealText = Color(light: 0x0E7A6B, dark: 0x4CC9B0)

    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)

    static let heroGradient = LinearGradient(
        colors: [teal, pitch],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

extension Color {
    init(hex: UInt32) {
        self.init(uiColor: UIColor(hex: hex))
    }

    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

enum Links {
    static let whatsappNumber = "966530634750"
    static let instagram = URL(string: "https://www.instagram.com/liproacademy")!
    static let website = URL(string: "https://liproacademy.com")!
    static let primaryPhone = "0530634750"
    static let primaryPhoneDisplay = "0530634750"

    static func whatsapp(_ message: String? = nil) -> URL {
        var components = URLComponents(string: "https://wa.me/\(whatsappNumber)")!
        if let message {
            components.queryItems = [URLQueryItem(name: "text", value: message)]
        }
        return components.url!
    }

    static func phone(_ number: String) -> URL {
        URL(string: "tel:\(number)")!
    }
}
