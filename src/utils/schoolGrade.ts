export function getJapaneseSchoolYear(date = new Date()) {
  return date.getFullYear() - (date.getMonth() < 3 ? 1 : 0);
}

export function calculateSchoolGrade(birthDate?: string, referenceDate = new Date()) {
  if (!birthDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return '';

  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const entersElementarySchoolYear =
    birthYear + (birthMonth < 4 || (birthMonth === 4 && birthDay === 1) ? 6 : 7);
  const gradeNumber = getJapaneseSchoolYear(referenceDate) - entersElementarySchoolYear + 1;

  if (gradeNumber <= 0) return '未就学';
  if (gradeNumber <= 6) return `小学${gradeNumber}年生`;
  if (gradeNumber <= 9) return `中学${gradeNumber - 6}年生`;
  if (gradeNumber <= 12) return `高校${gradeNumber - 9}年生`;
  return '高校卒業相当';
}

export function formatBirthDate(birthDate?: string) {
  if (!birthDate) return '';
  const [year, month, day] = birthDate.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}
