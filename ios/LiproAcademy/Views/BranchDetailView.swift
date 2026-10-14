import SwiftUI

struct BranchDetailView: View {
    let branch: Branch

    private let weekOrder = Weekday.trainingDays

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Image(branch.photo)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 280)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))

                VStack(alignment: .leading, spacing: 6) {
                    Text(branch.name)
                        .font(.largeTitle.bold())
                    Text(branch.city)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 12) {
                    InfoRow(icon: "clock.fill", title: "موعد التدريب", value: branch.time)
                    InfoRow(icon: "sportscourt.fill", title: "الملعب", value: branch.venue)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("أيام التدريب")
                        .font(.headline)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(weekOrder) { day in
                                DayChip(title: day.short, isSelected: branch.trains(on: day))
                            }
                        }
                    }
                }

                VStack(spacing: 12) {
                    Link(destination: Links.whatsapp(branch.registerMessage)) {
                        Label("سجّل في هذا الفرع", systemImage: "message.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .foregroundStyle(Theme.pitch)
                            .background(Theme.gold, in: Capsule())
                    }

                    Link(destination: branch.mapURL) {
                        Label("الموقع على الخريطة", systemImage: "map.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .foregroundStyle(Theme.teal)
                            .background(Theme.teal.opacity(0.12), in: Capsule())
                    }
                }
            }
            .padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationBarTitleDisplayMode(.inline)
    }
}
