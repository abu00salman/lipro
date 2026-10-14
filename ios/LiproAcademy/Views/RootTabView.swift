import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            Tab("الرئيسية", systemImage: "house.fill") {
                HomeView()
            }

            Tab("الفروع", systemImage: "building.2.fill") {
                BranchesView()
            }

            Tab("الجدول", systemImage: "calendar") {
                ScheduleView()
            }

            Tab("تواصل", systemImage: "bubble.left.and.bubble.right.fill") {
                ContactView()
            }
        }
        .tint(Theme.teal)
    }
}
