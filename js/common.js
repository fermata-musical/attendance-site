const $ = (id) => document.getElementById(id);
const getMonthStr = (date) => date ? date.substring(0, 7) : "";
const getToday = () => new Date().setHours(0,0,0,0);
const getTodayStr = () => new Date().toISOString().split('T')[0];

function getWeekday(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[d.getDay()];
}
