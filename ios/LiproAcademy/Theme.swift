import SwiftUI

enum Theme {
    static let pitch = Color(hex: 0x04322C)
    static let teal = Color(hex: 0x0E7A6B)
    static let tealLit = Color(hex: 0x17A88F)
    static let gold = Color(hex: 0xF5B325)
    static let chalkCard = Color(hex: 0xEFF4F1)

    static let heroGradient = LinearGradient(
        colors: [teal, pitch],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

enum Links {
    static let whatsappNumber = "966530634750"
    static let instagram = URL(string: "https://www.instagram.com/liproacademy")!
    static let website = URL(string: "https://liproacademy.com")!

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
