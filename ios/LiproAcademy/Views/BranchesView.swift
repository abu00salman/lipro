import SwiftUI

struct BranchesView: View {
    enum Filter: String, CaseIterable, Identifiable {
        case all, favorites
        var id: String { rawValue }
    }

    @Namespace private var zoom
    @Environment(Favorites.self) private var favorites
    @State private var query = ""
    @State private var filter: Filter = .all
    @State private var appeared = false

    private var branches: [Branch] {
        let term = query.trimmingCharacters(in: .whitespaces)
        return Branch.all
            .filter { branch in
                guard !term.isEmpty else { return true }
                return branch.name.localizedStandardContains(term) || branch.city.localizedStandardContains(term)
            }
            .filter { branch in
                filter == .all || favorites.contains(branch)
            }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    Picker("branches.filter", selection: $filter.animation(.snappy)) {
                        Text("branches.filter.all").tag(Filter.all)
                        Text("branches.filter.favorites").tag(Filter.favorites)
                    }
                    .pickerStyle(.segmented)

                    if branches.isEmpty {
                        ContentUnavailableView(
                            filter == .favorites ? "branches.empty.favorites" : "branches.empty.search",
                            systemImage: filter == .favorites ? "heart" : "magnifyingglass"
                        )
                        .padding(.top, 40)
                    } else {
                        LazyVStack(spacing: 18) {
                            ForEach(Array(branches.enumerated()), id: \.element.id) { index, branch in
                                NavigationLink(value: branch) {
                                    BranchCard(branch: branch)
                                }
                                .buttonStyle(.plain)
                                .matchedTransitionSource(id: branch.id, in: zoom)
                                .scrollTransition { content, phase in
                                    content
                                        .scaleEffect(phase.isIdentity ? 1 : 0.94)
                                        .opacity(phase.isIdentity ? 1 : 0.6)
                                }
                                .modifier(Entrance(index: index, visible: appeared))
                            }
                        }
                        .animation(.snappy, value: branches)
                    }
                }
                .padding(16)
            }
            .background(Theme.canvas)
            .navigationTitle("branches.title")
            .searchable(text: $query, prompt: "branches.search")
            .navigationDestination(for: Branch.self) { branch in
                BranchDetailView(branch: branch)
                    .navigationTransition(.zoom(sourceID: branch.id, in: zoom))
            }
            .onAppear { appeared = true }
        }
    }
}
