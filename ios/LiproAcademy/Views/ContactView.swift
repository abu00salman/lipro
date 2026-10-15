import SwiftUI

struct ContactView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Link(destination: Links.whatsapp()) {
                        Label("contact.whatsapp", systemImage: "message.fill")
                    }
                    Link(destination: Links.phone("0530634750")) {
                        Label("0530634750", systemImage: "phone.fill")
                    }
                    Link(destination: Links.phone("0554527275")) {
                        Label("0554527275", systemImage: "phone.fill")
                    }
                } header: {
                    Text("contact.section.inquiries")
                }

                Section {
                    Link(destination: Links.instagram) {
                        Label("contact.instagram", systemImage: "camera.fill")
                    }
                    Link(destination: Links.website) {
                        Label("contact.website", systemImage: "globe")
                    }
                } header: {
                    Text("contact.section.follow")
                }

                Section {
                    Text("contact.about")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 4)
                }
            }
            .tint(Theme.teal)
            .navigationTitle("contact.title")
        }
    }
}
