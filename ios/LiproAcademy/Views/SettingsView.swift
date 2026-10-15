import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            Form {
                Section("settings.language") {
                    Picker("settings.language", selection: $settings.language) {
                        Text("lang.system").tag(AppLanguage.system)
                        Text("العربية").tag(AppLanguage.arabic)
                        Text("English").tag(AppLanguage.english)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section("settings.appearance") {
                    Picker("settings.appearance", selection: $settings.appearance) {
                        Label("appearance.system", systemImage: "circle.lefthalf.filled").tag(AppAppearance.system)
                        Label("appearance.light", systemImage: "sun.max.fill").tag(AppAppearance.light)
                        Label("appearance.dark", systemImage: "moon.fill").tag(AppAppearance.dark)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
            }
            .navigationTitle("settings.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("common.done") { dismiss() }
                        .bold()
                }
            }
        }
    }
}
