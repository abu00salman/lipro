import SwiftUI

struct RootTabView: View {
    @State private var favorites = Favorites()

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

            Tab("tab.contact", systemImage: "bubble.left.and.bubble.right.fill") {
                ContactView()
            }
        }
        .tint(Theme.teal)
        .environment(favorites)
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
