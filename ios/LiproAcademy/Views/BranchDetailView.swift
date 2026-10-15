import SwiftUI

struct BranchDetailView: View {
    let branch: Branch

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                gallery

                VStack(alignment: .leading, spacing: 6) {
                    Text(branch.name)
                        .font(.largeTitle.bold())
                    Text(branch.city)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 12) {
                    InfoRow(icon: "clock.fill", title: "detail.time", value: branch.timeText)
                    InfoRow(icon: "sportscourt.fill", title: "detail.venue", value: branch.venue)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("detail.days")
                        .font(.headline)

                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            ForEach(Weekday.trainingDays) { day in
                                DayChip(title: day.short, isSelected: branch.trains(on: day))
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                }

                VStack(spacing: 12) {
                    Link(destination: Links.whatsapp(branch.registerMessage)) {
                        Label("detail.register", systemImage: "message.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .foregroundStyle(Theme.pitch)
                            .background(Theme.gold, in: Capsule())
                    }

                    Link(destination: branch.mapURL) {
                        Label("detail.map", systemImage: "map.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .foregroundStyle(Theme.tealText)
                            .glassCapsule()
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .ignoresSafeArea(edges: .top)
        .background(Theme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                FavoriteButton(branch: branch)
                ShareLink(item: branch.mapURL, subject: Text(branch.name)) {
                    Image(systemName: "square.and.arrow.up")
                }
            }
        }
    }

    private var gallery: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(branch.photos, id: \.self) { photo in
                    Image(photo)
                        .resizable()
                        .scaledToFill()
                        .containerRelativeFrame(.horizontal)
                        .frame(height: 340)
                        .clipped()
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.hidden)
        .frame(height: 340)
    }
}
