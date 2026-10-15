import SwiftUI

extension View {
    /// زجاج Liquid Glass على iOS 26 وما بعده، ومادة شفافة على الإصدارات الأقدم
    @ViewBuilder
    func glassCapsule() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: .capsule)
        } else {
            self.background(.ultraThinMaterial, in: Capsule())
        }
    }

    @ViewBuilder
    func glassCard(cornerRadius: CGFloat = 28) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        } else {
            self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}

/// عنوان المعلومات أسفل الصورة، ويتبع اتجاه اللغة تلقائيًا
struct CardCaption: View {
    let branch: Branch

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(branch.name)
                .font(.title3.bold())
                .foregroundStyle(.white)

            HStack(spacing: 10) {
                Label(branch.city, systemImage: "mappin.and.ellipse")
                Label(branch.timeText, systemImage: "clock.fill")
            }
            .font(.footnote.weight(.medium))
            .foregroundStyle(.white.opacity(0.9))
            .labelStyle(.titleAndIcon)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
    }
}

struct BranchCard: View {
    let branch: Branch

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Image(branch.photos[0])
                .resizable()
                .scaledToFill()
                .frame(height: 150)
                .frame(maxWidth: .infinity)
                .clipped()

            LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom)

            CardCaption(branch: branch)
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(alignment: .topTrailing) {
            FavoriteButton(branch: branch)
                .padding(12)
        }
        .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
        .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
    }
}

/// بطاقة عرض أفقية كبيرة للصفحة الرئيسية
struct BranchHeroCard: View {
    let branch: Branch

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Image(branch.photos[0])
                .resizable()
                .scaledToFill()
                .containerRelativeFrame(.horizontal) { length, _ in length * 0.72 }
                .frame(height: 270)
                .clipped()

            LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .center, endPoint: .bottom)

            CardCaption(branch: branch)
        }
        .frame(height: 270)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(alignment: .topTrailing) {
            FavoriteButton(branch: branch)
                .padding(14)
        }
        .shadow(color: .black.opacity(0.2), radius: 20, y: 10)
    }
}

struct FavoriteButton: View {
    let branch: Branch
    @Environment(Favorites.self) private var favorites

    var body: some View {
        let isOn = favorites.contains(branch)
        let label: LocalizedStringKey = isOn ? "favorite.remove" : "favorite.add"

        Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                favorites.toggle(branch)
            }
        } label: {
            Image(systemName: isOn ? "heart.fill" : "heart")
                .font(.title3)
                .foregroundStyle(isOn ? Color.red : Color.primary)
                .symbolEffect(.bounce, value: isOn)
                .frame(width: 44, height: 44)
                .glassCapsule()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
        .sensoryFeedback(.impact(weight: .light), trigger: isOn)
    }
}

struct SectionHeader: View {
    let title: LocalizedStringKey
    var subtitle: LocalizedStringKey? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title2.bold())
            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
                isSelected ? Theme.gold : Theme.surface,
                in: Capsule()
            )
    }
}

struct InfoRow: View {
    let icon: String
    let title: LocalizedStringKey
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Theme.tealText)
                .frame(width: 40, height: 40)
                .background(Theme.teal.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

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
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// حركة دخول متدرجة: كل عنصر يتأخر عن الذي قبله قليلًا
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
