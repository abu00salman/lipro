import SwiftUI

struct ContactView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Link(destination: Links.whatsapp()) {
                        Label("واتساب الأكاديمية", systemImage: "message.fill")
                    }
                    Link(destination: Links.phone("0530634750")) {
                        Label("0530634750", systemImage: "phone.fill")
                    }
                    Link(destination: Links.phone("0554527275")) {
                        Label("0554527275", systemImage: "phone.fill")
                    }
                } header: {
                    Text("للتسجيل والاستفسار")
                }

                Section {
                    Link(destination: Links.instagram) {
                        Label("إنستغرام", systemImage: "camera.fill")
                    }
                    Link(destination: Links.website) {
                        Label("الموقع الرسمي", systemImage: "globe")
                    }
                } header: {
                    Text("تابعنا")
                }

                Section {
                    Text("أكاديمية كرة قدم مرخصة من وزارة الرياضة، تدرّب الناشئين من عمر ٥ إلى ١٨ سنة في ٧ فروع بمنطقة جازان وخميس مشيط والباحة.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 4)
                }
            }
            .tint(Theme.teal)
            .navigationTitle("تواصل معنا")
        }
    }
}
