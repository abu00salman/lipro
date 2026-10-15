import SwiftUI

struct RootTabView: View {
    @State private var favorites = Favorites()
    @State private var settings = AppSettings()
    @State private var savedMatches = SavedMatches()

    var body: some View {
        TabView {
            Tab("tab.home", systemImage: "house.fill") {
                HomeView()
            }

            Tab("tab.branches", systemImage: "building.2.fill") {
                BranchesView()
            }

            Tab("tab.schedule", systemImage: "calendar") {
                ScheduleView()
            }

            Tab("tab.matches", systemImage: "sportscourt.fill") {
                MatchesView()
            }

            Tab("tab.contact", systemImage: "bubble.left.and.bubble.right.fill") {
                ContactView()
            }
        }
        .id(settings.language)
        .tint(Theme.teal)
        .environment(favorites)
        .environment(settings)
        .environment(savedMatches)
        .environment(\.locale, L10n.locale)
        .environment(\.layoutDirection, L10n.isEnglish ? .leftToRight : .rightToLeft)
        .preferredColorScheme(settings.appearance.colorScheme)
        .modifier(TabMinimizeModifier())
    }
}

/// يصغّر شريط التبويب الزجاجي عند التمرير على iOS 26 وما بعده
private struct TabMinimizeModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            content
        }
    }
}
