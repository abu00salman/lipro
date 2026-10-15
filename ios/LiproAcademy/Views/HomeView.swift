import SwiftUI

struct HomeView: View {
    @Namespace private var zoom
    @State private var appeared = false
    @State private var logoVisible = false
    @State private var showSettings = false

    private let today = Weekday.riyadhToday
    private var todayBranches: [Branch] { Branch.training(on: today) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    hero
                    carousel
                    stats
                    todaySection
                    registerCard
                }
                .padding(.bottom, 40)
            }
            .ignoresSafeArea(edges: .top)
            .background(Theme.canvas)
            .overlay(alignment: .topTrailing) {
                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .glassCapsule()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("settings.title"))
                .padding(.top, 60)
                .padding(.trailing, 24)
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Branch.self) { branch in
                BranchDetailView(branch: branch)
                    .navigationTransition(.zoom(sourceID: branch.id, in: zoom))
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
                    .presentationDetents([.medium, .large])
            }
            .onAppear {
                withAnimation(.spring(response: 0.7, dampingFraction: 0.75).delay(0.1)) {
                    logoVisible = true
                }
                withAnimation(.easeOut(duration: 0.5).delay(0.25)) {
                    appeared = true
                }
            }
        }
    }

    private var hero: some View {
        VStack(spacing: 18) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(height: 118)
                .padding(16)
                .background(Theme.chalk, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .shadow(color: Theme.gold.opacity(0.35), radius: 26, y: 12)
                .scaleEffect(logoVisible ? 1 : 0.55)
                .opacity(logoVisible ? 1 : 0)

            VStack(spacing: 8) {
                Text("home.title")
                    .font(.title.bold())
                    .foregroundStyle(.white)

                Text("home.subtitle")
                    .font(.subheadline)
                    .foregroundStyle(Theme.gold)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 84)
        .padding(.bottom, 40)
        .background {
            UnevenRoundedRectangle(bottomLeadingRadius: 36, bottomTrailingRadius: 36)
                .fill(Theme.heroGradient)
                .ignoresSafeArea(edges: .top)
        }
    }

    private var carousel: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "home.branches.title")
                .padding(.horizontal, 24)
                .modifier(Entrance(index: 0, visible: appeared))

            ScrollView(.horizontal) {
                LazyHStack(spacing: 14) {
                    ForEach(Branch.all) { branch in
                        NavigationLink(value: branch) {
                            BranchHeroCard(branch: branch)
                        }
                        .buttonStyle(.plain)
                        .matchedTransitionSource(id: branch.id, in: zoom)
                        .scrollTransition(axis: .horizontal) { content, phase in
                            content
                                .scaleEffect(phase.isIdentity ? 1 : 0.9)
                                .opacity(phase.isIdentity ? 1 : 0.55)
                        }
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 28, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
        }
    }

    private var stats: some View {
        HStack(spacing: 12) {
            StatBox(value: "7", label: "home.stat.branches")
            StatBox(value: "3", label: "home.stat.days")
            StatBox(value: "5–18", label: "home.stat.ages")
        }
        .padding(.horizontal, 24)
        .modifier(Entrance(index: 1, visible: appeared))
    }

    private var todaySection: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                SectionHeader(title: "home.today.title")
                (Text(today.title) + Text(" · ") + Text("home.riyadhTime"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 24)
            .modifier(Entrance(index: 2, visible: appeared))

            VStack(spacing: 16) {
                if todayBranches.isEmpty {
                    Text("home.today.empty")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(20)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                } else {
                    ForEach(Array(todayBranches.enumerated()), id: \.element.id) { index, branch in
                        NavigationLink(value: branch) {
                            BranchCard(branch: branch)
                        }
                        .buttonStyle(.plain)
                        .matchedTransitionSource(id: branch.id, in: zoom)
                        .modifier(Entrance(index: index + 3, visible: appeared))
                    }
                }
            }
            .padding(.horizontal, 24)
        }
    }

    private var registerCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("home.register.title")
                .font(.title3.bold())
                .foregroundStyle(.white)

            Text("home.register.body")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))

            Link(destination: Links.whatsapp(L10n.pick("مرحبًا، أبغى أستفسر عن التسجيل في الأكاديمية", "Hello, I'd like to ask about registering at the academy"))) {
                Label("home.register.button", systemImage: "message.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(Theme.pitch)
                    .background(Theme.gold, in: Capsule())
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.heroGradient, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.horizontal, 24)
        .modifier(Entrance(index: branchesCountIndex, visible: appeared))
    }

    private var branchesCountIndex: Int { todayBranches.count + 4 }
}

private struct StatBox: View {
    let value: String
    let label: LocalizedStringKey

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(Theme.tealText)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
