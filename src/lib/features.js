// The explanation shown in the UI for each of the three student features (mirrored in README.md).
export const FEATURES = {
  hours: {
    title: 'Work-hours compatibility indicator',
    problem:
      'Many international students have a limit on how many hours they can work each week, set by their study conditions and shaped by their own timetable. Job ads rarely make it easy to tell whether a job\'s hours would fit.',
    why:
      'Finding out after applying that the hours clash wastes limited time, and students understandably want to check early. Knowing which jobs clearly fit lets them focus on the realistic ones.',
    implementation:
      'You enter your own weekly limit and the hours you already use. The scraper reads each WorkIndia job\'s published "Job Timings" (for example 3 hours a day, Monday to Saturday) and works out hours per week. The API compares that with your free hours and labels each job: fits, may fit, more than your free hours, or hours not listed. You can also filter by it. We only compare numbers you typed in; we never state what a student is or is not legally allowed to do.',
  },
  commute: {
    title: 'Campus and commute matching',
    problem:
      'A job that looks perfect can be on the other side of the city. Commuting eats into study time and pay, and a new student does not yet know the geography.',
    why:
      'Many students travel by public transport or on foot and fit work around classes, so how far a job is from campus often decides whether it is realistic.',
    implementation:
      'You pick your campus from a list or search for any place (OpenStreetMap, cached). Each job\'s location text is turned into coordinates once (neighbourhood level for WorkIndia, city level for the others) and stored. The API measures the straight-line distance, shows "Close / Moderate / Far" relative to your own maximum commute, and can sort by nearest or filter by distance. It is an approximate straight-line distance, not a route or travel time.',
  },
  tracker: {
    title: 'Application tracker',
    problem:
      'Applications end up scattered across several sites, and it is easy to lose track of where you applied, who you spoke to and what happens next.',
    why:
      'Students often apply to many part-time and entry-level jobs while studying. Keeping status, dates and notes in one place makes follow-ups easier, and your record stays even after a listing disappears from the original site.',
    implementation:
      'Save any job from a card or its page. Each saved job becomes a row in the applications table with a status (Saved, Applied, Interview, Offer, Rejected), an application date and notes. This dashboard reads and updates those rows through the API, and you can filter by status.',
  },
};
