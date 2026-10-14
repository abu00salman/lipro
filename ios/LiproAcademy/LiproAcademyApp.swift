import SwiftUI

@main
struct LiproAcademyApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(\.locale, Locale(identifier: "ar"))
                .environment(\.layoutDirection, .rightToLeft)
        }
    }
}
