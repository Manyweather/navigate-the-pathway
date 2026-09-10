export type StudentOrganization = {
  key: string;
  name: string;
  college: "College of Medicine" | "College of Nursing" | "College of Pharmacy" | "College of Dental Medicine" | "University-wide";
  campus: string;
  mission: string;
  advisor: string;
  aliases: string[];
  sourceDate: string;
  pilotAvailable: boolean;
};

const sourceDate = "2026-09-10";
const slug = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const organization = (
  name: string,
  college: StudentOrganization["college"],
  campus: string,
  mission: string,
  advisor: string,
  aliases: string[] = [],
): StudentOrganization => ({ key: slug(name), name, college, campus, mission, advisor, aliases, sourceDate, pilotAvailable: college === "College of Medicine" });

const medicine = [
  organization("American Association of Neurological Surgery (AANS) Roseman University College of Medicine Student Chapter", "College of Medicine", "Henderson", "Build student exposure to neurological surgery through education and professional connection.", "Dr. Daniel Van Tonder", ["AANS"]),
  organization("Anesthesiology Interest Group", "College of Medicine", "Henderson", "Create focused anesthesiology exposure through airway workshops, faculty mentorship, and operating-room shadowing pathways.", "Dr. Daniel Van Tonder", ["AIG"]),
  organization("Asian Pacific American Medical Student Association", "College of Medicine", "Henderson", "Promote the health and well-being of Las Vegas AANHPI communities through outreach, education, and advocacy.", "Dr. Julpohng ‘JP’ Vilai", ["APAMSA"]),
  organization("Arts in Medicine", "College of Medicine", "Henderson", "Cultivate empathetic future physicians by exploring patient perspectives through the arts and medical humanities.", "Inaia Phoenix"),
  organization("Business in Medicine", "College of Medicine", "Henderson", "Build business and financial literacy for sustainable, patient-centered medical practice and entrepreneurship.", "Dr. Farzad Kamyar"),
  organization("Dermatology Interest Group Association", "College of Medicine", "Henderson", "Support students interested in dermatology through service, education, and mentorship.", "Dr. Sarah Bovenberg", ["DIGA"]),
  organization("Emergency Medicine Interest Group", "College of Medicine", "Henderson", "Expose medical students to the scope of emergency medicine through education, mentorship, and career exploration.", "Dr. Thomas Swoboda", ["EMIG"]),
  organization("Healthcare Policy Club", "College of Medicine", "Henderson", "Prepare future physicians to engage in healthcare policy, systems change, and advocacy that advances health equity.", "Judy Hanrahan"),
  organization("Internal Medicine Interest Group", "College of Medicine", "Henderson", "Support exploration of internal medicine through mentorship, education, scholarship, service, and professional development.", "Dr. Nirupa Paulraj", ["IMIG"]),
  organization("Kern National Network", "College of Medicine", "Henderson", "Create a community in which future healthcare providers flourish through caring, character, and practical wisdom.", "Jennifer Haley", ["KNN"]),
  organization("Nature and Nurture", "College of Medicine", "Henderson", "Connect environmental sustainability, human health, and community well-being through education and hands-on initiatives.", "Dr. Amanda Koziel"),
  organization("Oncology Student Interest Group", "College of Medicine", "Henderson", "Cultivate interest in oncology through mentorship, research, education, community outreach, and patient care.", "Dr. Joseph Lasky", ["OSIG"]),
  organization("Open Door Health Initiative", "College of Medicine", "Henderson", "Advance compassionate and equitable care with underserved and unhoused Las Vegas communities through sustained partnership.", "Dr. Daniel Moses", ["ODHI"]),
  organization("Pediatrics Interest Group at RUCOM", "College of Medicine", "Henderson", "Explore pediatrics through mentorship, clinical exposure, service, health literacy, and attention to workforce needs.", "Dr. Julpohng ‘JP’ Vilai", ["PIG"]),
  organization("Physical Medicine and Rehabilitation Interest Group", "College of Medicine", "Henderson", "Support student exploration of physical medicine and rehabilitation.", "Dr. Nirupa Paulraj", ["PM&R Interest Group"]),
  organization("Primary Care Interest Group", "College of Medicine", "Henderson", "Expose students to generalist medical fields and diverse primary-care careers.", "Dr. Caitlin White", ["PCIG"]),
  organization("Psychiatry Student Interest Group Network", "College of Medicine", "Henderson", "Advance psychiatry knowledge, community wellness, professional development, and open conversation about mental health.", "Dr. Farzad Kamyar", ["PsychSIGN"]),
  organization("Student Community Outreach Program", "College of Medicine", "Henderson", "Partner with communities to address health needs, provide culturally sensitive education, and sustain long-term wellness connections.", "Dr. Daniel Moses", ["SCOP"]),
  organization("The Surgical, Anatomical, and Radiological Interest Group", "College of Medicine", "Henderson", "Foster early surgery, anatomy, and radiology exposure through hands-on learning, mentorship, and collaborative education.", "Dr. Dietrich Lorke", ["SAR"]),
  organization("Vietnamese American Medical Student Association", "College of Medicine", "Henderson", "Improve healthcare outcomes for Vietnamese communities through service, cultural connection, and attention to health disparities.", "Dr. Sydney Phan", ["VAMSA"]),
];

const university = [
  organization("Black Student Union", "University-wide", "Henderson", "Provide a safe, affirming place for Roseman students and uplift minority students through leadership, networking, and partnership.", "Dr. Arup Chakraborty", ["BSU"]),
  organization("Christian Medical & Dental Association", "University-wide", "Multiple campuses", "Integrate faith and healthcare while supporting compassionate service, fellowship, and ethical dialogue.", "Dr. Claudia Freitas", ["CMDA"]),
  organization("Drug Abuse Awareness Team", "University-wide", "Henderson", "Educate young people about prescription and nonprescription drug misuse and the dangers of addiction.", "Dr. Krystal Riccio", ["DAAT"]),
  organization("Latter-day Saints Student Association", "University-wide", "South Jordan", "Create an open community for LDS students and others interested in fellowship and shared learning.", "Dr. Casey Sayre", ["LDSSA"]),
  organization("Middle Eastern Students Association of Nevada", "University-wide", "Henderson", "Empower minorities, build understanding of Middle Eastern cultures, and improve culturally responsive healthcare.", "TBD", ["MESANV"]),
  organization("Pan-Asians Towards Healthcare", "University-wide", "Henderson", "Increase representation and cultural competence while educating about health issues affecting Pan-Asian communities.", "Dr. Christopher So", ["PATH"]),
  organization("RU Jewish Club", "University-wide", "Henderson", "Offer an inclusive environment for students to learn, observe, and share Jewish traditions and heritage.", "Professor Nancy Bryan"),
  organization("RUHS Lesbian, Gay, Bisexual, Transgender, Queer, Ally Student Association", "University-wide", "Henderson and South Jordan", "Create a safe and supportive LGBTQA community and promote wellness and positive representation in healthcare.", "Dr. Erik Dillon; Dr. Barbara Tanner; Professor Natalie Maughan", ["LGBTQA"]),
  organization("Student Government Association", "University-wide", "Henderson and South Jordan", "Represent Roseman students by campus and serve as a voice for the student body.", "Dr. Surajit Dey", ["SGA"]),
];

const nursing = [
  organization("Association of periOperative Registered Nurses Student Chapter", "College of Nursing", "Henderson", "Prepare nursing students for perioperative practice while advancing patient safety and interprofessional collaboration.", "Katie Dobson", ["AORN"]),
  organization("Asian American Pacific Islander Nurses Association of Nevada – Roseman University Student Nurses Association", "College of Nursing", "Henderson", "Support AAPI nurses and students, build partnerships, and advance community health and policy.", "Professor Esperanza Obasi", ["AAPINA of Nevada – RUSNA"]),
  organization("Black Student Nurses Association", "College of Nursing", "Henderson", "Empower, support, and educate Black nursing students as compassionate and competent professionals.", "Dorshey Dean", ["BSNA"]),
  organization("Critical Care and Emergency Student Nurses Association", "College of Nursing", "Henderson and South Jordan", "Prepare students for critical and emergency nursing through career education, practical preparation, and service.", "Dr. Barbara Tanner; Professor Victor Venegas", ["CCESNA"]),
  organization("Global Health Student Nurses Association", "College of Nursing", "Henderson", "Connect nursing students with meaningful local and global service and education about global health.", "Dr. Andrea LeClaire", ["GHSNA"]),
  organization("Honor Society of Nursing", "College of Nursing", "Henderson and South Jordan", "Recognize academic excellence, leadership, service, and commitment to nursing.", "Dr. Fred Calixtro; Dr. Beth Green"),
  organization("Student Nurses’ Association", "College of Nursing", "Henderson and South Jordan", "Connect student nurses with professional development and community health activities.", "Professor Stephanie Mastin; Professor Natalie Maughan", ["SNA"]),
  organization("Maternal and Neonatal Student Nurses’ Association", "College of Nursing", "Henderson and South Jordan", "Develop students interested in women’s health, obstetric care, and neonatal healthcare.", "Professor Melissa Willden; Professor Stacey Smith; Dr. Barbara Tanner", ["MANSNA"]),
];

const pharmacy = [
  organization("Academy of Managed Care Pharmacy", "College of Pharmacy", "Henderson and South Jordan", "Prepare students for managed care pharmacy through education, leadership, networking, and professional development.", "Dr. Danielle Gundrum", ["AMCP"]),
  organization("American Association of Pharmaceutical Scientists", "College of Pharmacy", "Henderson", "Build research, presentation, and educational experience in pharmaceutical science.", "Dr. Arup Chakraborty", ["AAPS"]),
  organization("Student College of Clinical Pharmacy", "College of Pharmacy", "Henderson", "Strengthen clinical skills and support students pursuing clinical pharmacy careers, residencies, and fellowships.", "Dr. Evan Williams", ["SCCP"]),
  organization("American Society of Consultant Pharmacists", "College of Pharmacy", "Henderson", "Develop knowledge of senior-care pharmacy and service to older adults.", "Dr. Catherine Oswald; Dr. Michelle Hon", ["ASCP"]),
  organization("Kappa Psi Pharmaceutical Fraternity, Inc.", "College of Pharmacy", "Henderson and South Jordan", "Advance pharmacy through fellowship, scholarship, service, and professional ideals.", "Dr. Alana Whittaker; Dr. Danielle Gundrum", ["Kappa Psi"]),
  organization("Industry Pharmacists Organization", "College of Pharmacy", "Henderson", "Advance industry-based pharmacy careers and demonstrate their value.", "Dr. Surajit Dey", ["IPhO"]),
  organization("National Community Pharmacists Association", "College of Pharmacy", "Henderson", "Develop community pharmacy leadership through entrepreneurship, service, advocacy, and professional learning.", "Dr. Krystal Riccio", ["NCPA"]),
  organization("National Hispanic Pharmacist Association Roseman University Student Chapter", "College of Pharmacy", "Henderson", "Improve Hispanic community health through advocacy, outreach, medication education, and navigation support.", "Danielle Valls", ["NHPA"]),
  organization("Phi Delta Chi", "College of Pharmacy", "Henderson and South Jordan", "Develop pharmacy leaders through professional service, fellowship, and camaraderie.", "Dr. Arup Chakraborty; Dr. Quynh Nhu Doan; Dr. Scott Shipley", ["PDC"]),
  organization("Phi Lambda Sigma", "College of Pharmacy", "Henderson and South Jordan", "Promote and recognize leadership development in pharmacy.", "Dr. Ragini Bhakta; Dr. Tyler Rose", ["PLS"]),
  organization("Student Alliance", "College of Pharmacy", "Henderson and South Jordan", "Support career exploration, postgraduate preparation, service, networking, professional growth, and leadership.", "Dr. Mark Decerbo; Dr. Ken Kunke; Dr. Danielle Gundrum; Dr. Scott Shipley", ["SA", "APhA", "ASHP"]),
];

const dental = [
  organization("Academy of General Dentistry Student Chapter", "College of Dental Medicine", "South Jordan", "Advance general dentistry and oral health through education, advocacy, and dental-community engagement.", "Dr. David McMillan", ["AGD"]),
  organization("Accessible Smiles Alliance", "College of Dental Medicine", "South Jordan", "Support dental students with disabilities and advance accessible, compassionate care for patients with disabilities.", "Dr. Kamran Awan"),
  organization("Advanced Dental Education Club", "College of Dental Medicine", "South Jordan", "Help students explore advanced dental education and prepare for postgraduate and employment applications.", "TBD"),
  organization("American Dental Education Association", "College of Dental Medicine", "South Jordan", "Advance dental education, community oral-health education, and interest in academic dentistry.", "Dr. Robert Alder; Dr. Claudia Freitas", ["ADEA"]),
  organization("American Student Dental Association", "College of Dental Medicine", "South Jordan", "Protect and advance dental-student interests through education, representation, advocacy, and organized dentistry.", "Dr. Todd Bowman; Dr. Duane Callahan", ["ASDA"]),
  organization("Asian American Dental Student Association", "College of Dental Medicine", "South Jordan", "Promote education and advocacy around Asian and Pacific Islander oral-health issues.", "Larilyn Dang", ["AADSA"]),
  organization("Dental Student Association", "College of Dental Medicine", "South Jordan", "Represent students and organizations while fostering professionalism, ethics, collegiality, and a healthy learning environment.", "Dr. Rachel Tomco Novak", ["DSA"]),
  organization("Ensign Academy", "College of Dental Medicine", "South Jordan", "Promote dental education, service, and fellowship among dental professionals.", "Dr. Duane Callahan"),
  organization("Hispanic Dental Association", "College of Dental Medicine", "South Jordan", "Promote and advance Hispanic community oral-health issues in Utah.", "Dr. David Densley", ["HDA"]),
  organization("Lucy Hobbs Initiative", "College of Dental Medicine", "South Jordan", "Empower women in dentistry through education, innovation, and equality.", "Melanie Rindlisbacher"),
  organization("Middle Eastern Dental Association", "College of Dental Medicine", "South Jordan", "Celebrate Middle Eastern cultures and support culturally informed care and mental-health awareness.", "Dr. Mariana Pavlova", ["MEDA"]),
  organization("National Student Research Group – Roseman College of Dental Medicine", "College of Dental Medicine", "South Jordan", "Promote student research, evidence-based dentistry, faculty connections, and interdisciplinary collaboration.", "Dr. Man Hung", ["NSRG"]),
  organization("Special Needs Care Dentistry Association", "College of Dental Medicine", "South Jordan", "Build awareness and support students interested in treating patients who require special care.", "Dr. Ryan Moffat", ["SNCDA"]),
  organization("Student Professionalism and Ethics Association in Dentistry", "College of Dental Medicine", "South Jordan", "Support lifelong ethical behavior and professionalism in dental practice.", "Dr. Shannon Young", ["SPEA"]),
  organization("Tau Sigma Military Dental Club", "College of Dental Medicine", "South Jordan", "Support military-sponsored students and serve Salt Lake-area communities and veterans through oral-health initiatives.", "Dr. Joseph Cheever", ["Tau Sigma"]),
];

export const studentOrganizations: StudentOrganization[] = [
  ...medicine,
  ...university,
  ...nursing,
  ...pharmacy,
  ...dental,
];

export const organizationCollegeOrder = ["College of Medicine", "University-wide", "College of Nursing", "College of Pharmacy", "College of Dental Medicine"] as const;

export function organizationsForSelect() {
  const order = new Map(organizationCollegeOrder.map((college, index) => [college, index]));
  return [...studentOrganizations].sort((a, b) => (order.get(a.college) ?? 99) - (order.get(b.college) ?? 99) || a.name.localeCompare(b.name));
}
