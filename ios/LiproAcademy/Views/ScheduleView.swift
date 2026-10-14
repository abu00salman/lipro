import SwiftUI

struct ScheduleView: View {
    @State private var selected: Weekday

    init() {
        let today = Weekday.riyadhToday
        _selected = State(initialValue: today == .friday ? .saturday : today)
    }

    private var items: [Branch] {
        Branch.training(on: selected)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    dayPicker

                    VStack(spacing: 14) {
                        ForEach(items) { branch in
                            ScheduleRow(branch: branch)
                        }
                    }
                    .id(selected)
                    .transition(
                        .asymmetric(
                            insertion: .move(edge: .trailing).combined(with: .opacity),
                            removal: .move(edge: .leading).combined(with: .opacity)
                        )
                    )
                }
                .padding(16)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("الجدول")
        }
    }

    private var dayPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Weekday.trainingDays) { day in
                    Button {
                        withAnimation(.snappy(duration: 0.35)) {
                            selected = day
                        }
                    } label: {
                        DayChip(title: day.title, isSelected: day == selected)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
        .sensoryFeedback(.selection, trigger: selected)
    }
}

private struct ScheduleRow: View {
    let branch: Branch

    var body: some View {
        HStack(spacing: 14) {
            Image(branch.photo)
                .resizable()
                .scaledToFill()
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(branch.name)
                    .font(.headline)
                Text(branch.venue)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text(branch.time)
                .font(.caption.weight(.bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .foregroundStyle(Theme.pitch)
                .background(Theme.gold, in: Capsule())
        }
        .padding(12)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
