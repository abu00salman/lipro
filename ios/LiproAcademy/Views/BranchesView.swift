import SwiftUI

struct BranchesView: View {
    @Namespace private var zoom
    @State private var query = ""
    @State private var appeared = false

    private var branches: [Branch] {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return Branch.all }
        return Branch.all.filter {
            $0.name.localizedStandardContains(term) || $0.city.localizedStandardContains(term)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 18) {
                    ForEach(Array(branches.enumerated()), id: \.element.id) { index, branch in
                        NavigationLink(value: branch) {
                            BranchCard(branch: branch)
                        }
                        .buttonStyle(.plain)
                        .matchedTransitionSource(id: branch.id, in: zoom)
                        .modifier(Entrance(index: index, visible: appeared))
                    }
                }
                .padding(16)
                .animation(.snappy, value: branches)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("الفروع")
            .searchable(text: $query, prompt: "ابحث باسم الفرع أو المدينة")
            .overlay {
                if branches.isEmpty {
                    ContentUnavailableView.search(text: query)
                }
            }
            .navigationDestination(for: Branch.self) { branch in
                BranchDetailView(branch: branch)
                    .navigationTransition(.zoom(sourceID: branch.id, in: zoom))
            }
            .onAppear { appeared = true }
        }
    }
}
