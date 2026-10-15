import SwiftUI

struct ContactView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    hero
                    whatsappButton
                    callCard
                    socialGrid
                    footer
                }
                .padding(16)
            }
            .background(Theme.canvas)
            .navigationTitle("contact.title")
        }
    }

    private var hero: some View {
        VStack(spacing: 14) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(height: 72)
                .padding(12)
                .background(Theme.chalk, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

            Text("contact.lead")
                .font(.body)
                .foregroundStyle(.white.opacity(0.9))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Theme.heroGradient, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    private var whatsappButton: some View {
        Link(destination: Links.whatsapp()) {
            Label("contact.whatsapp", systemImage: "message.fill")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .foregroundStyle(Theme.pitch)
                .background(Theme.gold, in: Capsule())
        }
    }

    private var callCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("contact.call")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)

            Link(destination: Links.phone(Links.primaryPhone)) {
                ContactRow(icon: "phone.fill", title: Text(verbatim: Links.primaryPhoneDisplay), subtitle: "contact.phone.sub")
            }
        }
    }

    private var socialGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("contact.social")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)

            VStack(spacing: 0) {
                Link(destination: Links.instagram) {
                    ContactRow(icon: "camera.fill", title: Text("contact.instagram"), subtitle: "contact.instagram.sub")
                }
                Divider().padding(.leading, 76)
                Link(destination: Links.website) {
                    ContactRow(icon: "globe", title: Text("contact.website"), subtitle: "contact.website.sub")
                }
            }
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    private var footer: some View {
        Text("contact.about")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 12)
            .padding(.top, 4)
    }
}

private struct ContactRow: View {
    let icon: String
    let title: Text
    let subtitle: LocalizedStringKey

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Theme.tealText)
                .frame(width: 44, height: 44)
                .background(Theme.teal.opacity(0.14), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                title
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.forward")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(16)
        .contentShape(Rectangle())
    }
}
