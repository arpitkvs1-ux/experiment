/** Column order must match Google Sheet "AllStudentDetails" row 1 */
export const HEADERS = [
  "R. No.",
  "Admission Year",
  "Admission No.",
  "Date of Admission",
  "Student Name",
  "House",
  "Date Of Birth",
  "Gender",
  "Category",
  "KV Category",
  "Mother's Name",
  "Mobile No",
  "Mother's Occupation",
  "Fathers Name",
  "Father's Occupation",
  "Address",
  "Admission Class",
  "Admission Quota",
  "Blood Group",
  "Single Girl Child",
  "RTE",
  "Minority",
  "Email ID",
  "UBI ID",
  "Aadhar Card No",
  "APPAR ID",
  "PEN",
  "Reimbursement Claimed",
  "Total Quarterly Fee",
  "Photo",
  "Remark",
];

export function emptyRowObject() {
  const o = {};
  for (const h of HEADERS) o[h] = "";
  return o;
}

export function rowToArray(obj) {
  return HEADERS.map((h) => (obj[h] != null ? String(obj[h]) : ""));
}

export function arrayToRow(arr) {
  const o = emptyRowObject();
  HEADERS.forEach((h, i) => {
    if (arr[i] != null && arr[i] !== "") o[h] = String(arr[i]).trim();
  });
  return o;
}
