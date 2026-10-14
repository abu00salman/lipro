import SwiftUI

struct BranchCard: View {
    let branch: Branch

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Image(branch.photo)
                .resizable()
                .scaledToFill()
                .frame(height: 200)
                .frame(maxWidth: .infinity)
                .clipped()

            LinearGradient(
                colors: [.clear, .black.opacity(0.8)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 8) {
                Text(branch.name)
                    .font(.title3.bold())
                    .foregroundStyle(.white)

                HStack(spacing: 10) {
                    Label(branch.city, systemImage: "mappin.and.ellipse")
                    Label(branch.time, systemImage: "clock.fill")
                }
                .font(.footnote.weight(.medium))
                .foregroundStyle(.white.opacity(0.9))
                .labelStyle(.titleAndIcon)
            }
            .padding(18)
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
        .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}

struct DayChip: View {
    let title: String
    let isSelected: Bool

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .foregroundStyle(isSelected ? Theme.pitch : .primary)
            .background(
                isSelected ? Theme.gold : Color(uiColor: .secondarySystemGroupedBackground),
                in: Capsule()
            )
    }
}

struct InfoRow: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Theme.teal)
                .frame(width: 40, height: 40)
                .background(Theme.teal.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.body.weight(.medium))
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// حركة دخول متدرجة للعناصر، تتأخر كل بطاقة عن التي قبلها قليلًا
struct Entrance: ViewModifier {
    let index: Int
    let visible: Bool

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : 28)
            .animation(
                .spring(response: 0.6, dampingFraction: 0.86).delay(Double(index) * 0.07),
                value: visible
            )
    }
}
