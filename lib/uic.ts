export type UicIdentity = {
  ce_gender_identity?: string;
  ce_dob?: string;
  ce_first_name?: string;
  ce_middle_name_1?: string;
  ce_middle_name_2?: string;
  ce_middle_name_3?: string;
  ce_last_name?: string;
};

const genderPrefixes: Record<string, string> = {
  "1": "M",
  "2": "F",
  "3": "T",
  "4": "T",
  "5": "O",
  "9": "R",
};

const cleanLetters = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toUpperCase();

/** Build the REDCap UIC, including one initial for every populated middle-name field. */
export function generateUic(identity: UicIdentity) {
  const gender = genderPrefixes[identity.ce_gender_identity ?? ""] ?? "";
  const dob = (identity.ce_dob ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const firstInitial = cleanLetters(identity.ce_first_name ?? "").slice(0, 1);
  const middleInitials = [
    identity.ce_middle_name_1,
    identity.ce_middle_name_2,
    identity.ce_middle_name_3,
  ].map((name) => cleanLetters(name ?? "").slice(0, 1)).join("");
  const surname = cleanLetters(identity.ce_last_name ?? "");

  if (!gender || !dob || !firstInitial || !surname) return "";
  return `${gender}${dob[3]}${dob[2]}${dob[1]}${firstInitial}${middleInitials}_${surname[0]}${surname.at(-1)}`;
}
