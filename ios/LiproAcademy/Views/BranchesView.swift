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
                    Picker("branches.filter", selection: $filter) {
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
                            ForEach(branches) { branch in
                                NavigationLink(value: branch) {
                                    BranchCard(branch: branch)
                                }
                                .buttonStyle(.plain)
                                .matchedTransitionSource(id: branch.id, in: zoom)
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .padding(.bottom, 24)
            }
            .background(Theme.canvas)
            .navigationTitle("branches.title")
            .searchable(text: $query, prompt: "branches.search")
            .navigationDestination(for: Branch.self) { branch in
                BranchDetailView(branch: branch)
                    .navigationTransition(.zoom(sourceID: branch.id, in: zoom))
            }
        }
    }
}
