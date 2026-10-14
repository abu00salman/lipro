import SwiftUI

struct HomeView: View {
    @Namespace private var zoom
    @State private var appeared = false
    @State private var logoVisible = false

    private let today = Weekday.riyadhToday
    private var branches: [Branch] { Branch.training(on: today) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    hero
                    VStack(spacing: 28) {
                        stats
                        todaySection
                        registerCard
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 40)
            }
            .ignoresSafeArea(edges: .top)
            .background(Color(uiColor: .systemGroupedBackground))
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Branch.self) { branch in
                BranchDetailView(branch: branch)
                    .navigationTransition(.zoom(sourceID: branch.id, in: zoom))
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
                .background(Theme.chalkCard, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .shadow(color: Theme.gold.opacity(0.35), radius: 26, y: 12)
                .scaleEffect(logoVisible ? 1 : 0.55)
                .opacity(logoVisible ? 1 : 0)

            VStack(spacing: 8) {
                Text("أكاديمية ليبرو الرياضية")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                Text("كرة قدم للناشئين · مرخصة من وزارة الرياضة")
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

    private var stats: some View {
        HStack(spacing: 12) {
            StatBox(value: "٧", label: "فروع")
            StatBox(value: "٣", label: "أيام أسبوعيًا")
            StatBox(value: "٥–١٨", label: "سنة عمر اللاعب")
        }
        .modifier(Entrance(index: 0, visible: appeared))
    }

    private var todaySection: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("التدريب اليوم")
                    .font(.title3.bold())
                Text("\(today.title) · بتوقيت الرياض")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .modifier(Entrance(index: 1, visible: appeared))

            if branches.isEmpty {
                Text("لا يوجد تدريب اليوم، راجع الجدول الأسبوعي.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            } else {
                ForEach(Array(branches.enumerated()), id: \.element.id) { index, branch in
                    NavigationLink(value: branch) {
                        BranchCard(branch: branch)
                    }
                    .buttonStyle(.plain)
                    .matchedTransitionSource(id: branch.id, in: zoom)
                    .modifier(Entrance(index: index + 2, visible: appeared))
                }
            }
        }
    }

    private var registerCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("سجّل ابنك الآن")
                .font(.title3.bold())
                .foregroundStyle(.white)

            Text("أرسل لنا رسالة على واتساب وسنرد عليك بالتفاصيل وأقرب فرع لك.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))

            Link(destination: Links.whatsapp("مرحبًا، أبغى أستفسر عن التسجيل في الأكاديمية")) {
                Label("تواصل عبر واتساب", systemImage: "message.fill")
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
        .modifier(Entrance(index: branches.count + 2, visible: appeared))
    }
}

private struct StatBox: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(Theme.teal)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
