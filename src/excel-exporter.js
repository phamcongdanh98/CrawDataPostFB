const ExcelJS = require('exceljs');
const { formatVNDate, getCanonicalPostUrl } = require('./utils');

/**
 * Xuất dữ liệu bài viết ra định dạng Excel (.xlsx) chuyên nghiệp, thẩm mỹ cao
 * @param {Array} posts - Danh sách bài viết cần xuất
 * @param {Object} options - Tùy chọn bổ sung (stats, filterInfo)
 * @returns {Promise<Buffer>}
 */
async function generateExcelReport(posts, options = {}) {
  const { stats = null, filterInfo = {} } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fanpage Stat System';
  workbook.lastModifiedBy = 'Fanpage Stat System';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ==========================================================================
  // SHEET 1: DANH SÁCH CHI TIẾT BÀI VIẾT
  // ==========================================================================
  const sheet = workbook.addWorksheet('Danh sách bài viết', {
    views: [{ state: 'frozen', ySplit: 7, activeCell: 'A8' }],
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  // Thiết lập các cột
  sheet.columns = [
    { key: 'stt', width: 7 },
    { key: 'id', width: 18 },
    { key: 'created_time', width: 20 },
    { key: 'post_type', width: 13 },
    { key: 'publisher_name', width: 25 },
    { key: 'likes_count', width: 14 },
    { key: 'comments_count', width: 14 },
    { key: 'shares_count', width: 14 },
    { key: 'total_engagements', width: 16 },
    { key: 'publisher_status', width: 18 },
    { key: 'permalink_url', width: 32 },
    { key: 'publisher_profile_url', width: 30 },
    { key: 'message', width: 55 }
  ];

  // 1. BANNER TIÊU ĐỀ (Dòng 1 - 2)
  sheet.mergeCells('A1:M1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'BÁO CÁO THỐNG KÊ BÀI VIẾT & NGƯỜI ĐĂNG FANPAGE FACEBOOK';
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Deep Navy
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells('A2:M2');
  const subTitleCell = sheet.getCell('A2');
  const exportTime = formatVNDate(new Date().toISOString());
  const filterDesc = filterInfo.desc || 'Tất cả bài viết';
  subTitleCell.value = `Thời gian xuất báo cáo: ${exportTime}  |  Bộ lọc: ${filterDesc}  |  Tổng số bài: ${posts.length.toLocaleString('vi-VN')}`;
  subTitleCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF334155' } };
  subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 22;

  // Dòng 3: Trống
  sheet.getRow(3).height = 10;

  // 2. HÀNG THẺ KPI TỔNG QUAN (Dòng 4 - 5)
  // Tính toán nhanh chỉ số
  let sumLikes = 0;
  let sumComments = 0;
  let sumShares = 0;
  let countFound = 0;
  let countShared = 0;

  for (const p of posts) {
    sumLikes += p.likes_count || 0;
    sumComments += p.comments_count || 0;
    sumShares += p.shares_count || 0;
    if (p.publisher_status === 'FOUND') countFound++;
    if (p.post_type === 'SHARED') countShared++;
  }
  const totalEng = sumLikes + sumComments + sumShares;

  // Thẻ 1: Tổng bài (A4:B5)
  sheet.mergeCells('A4:B4');
  sheet.getCell('A4').value = 'TỔNG BÀI VIẾT';
  sheet.mergeCells('A5:B5');
  sheet.getCell('A5').value = posts.length;

  // Thẻ 2: Đã tìm tác giả (C4:D5)
  sheet.mergeCells('C4:D4');
  sheet.getCell('C4').value = 'ĐÃ XÁC ĐỊNH';
  sheet.mergeCells('C5:D5');
  sheet.getCell('C5').value = countFound;

  // Thẻ 3: Tự đăng / Chia sẻ (E4:F5)
  sheet.mergeCells('E4:F4');
  sheet.getCell('E4').value = 'TỰ ĐĂNG / SHARE';
  sheet.mergeCells('E5:F5');
  sheet.getCell('E5').value = `${posts.length - countShared} / ${countShared}`;

  // Thẻ 4: Lượt thích (G4:H5)
  sheet.mergeCells('G4:H4');
  sheet.getCell('G4').value = 'LƯỢT THÍCH';
  sheet.mergeCells('G5:H5');
  sheet.getCell('G5').value = sumLikes;

  // Thẻ 5: Bình luận (I4:J5)
  sheet.mergeCells('I4:J4');
  sheet.getCell('I4').value = 'BÌNH LUẬN';
  sheet.mergeCells('I5:J5');
  sheet.getCell('I5').value = sumComments;

  // Thẻ 6: Tổng tương tác (K4:M5)
  sheet.mergeCells('K4:M4');
  sheet.getCell('K4').value = 'TỔNG TƯƠNG TÁC';
  sheet.mergeCells('K5:M5');
  sheet.getCell('K5').value = totalEng;

  // Style thẻ KPI
  const kpiGroups = [
    { rangeTitle: 'A4', rangeVal: 'A5', bg: 'FFE0F2FE', fontColor: 'FF0369A1' }, // Blue
    { rangeTitle: 'C4', rangeVal: 'C5', bg: 'FFDCFCE7', fontColor: 'FF15803D' }, // Green
    { rangeTitle: 'E4', rangeVal: 'E5', bg: 'FFF3E8FF', fontColor: 'FF7E22CE' }, // Purple
    { rangeTitle: 'G4', rangeVal: 'G5', bg: 'FFFFE4E6', fontColor: 'FFE11D48' }, // Rose
    { rangeTitle: 'I4', rangeVal: 'I5', bg: 'FFFEF3C7', fontColor: 'FFB45309' }, // Amber
    { rangeTitle: 'K4', rangeVal: 'K5', bg: 'FFE0E7FF', fontColor: 'FF4338CA' }  // Indigo
  ];

  kpiGroups.forEach(({ rangeTitle, rangeVal, bg, fontColor }) => {
    const tCell = sheet.getCell(rangeTitle);
    tCell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: fontColor } };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    tCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const vCell = sheet.getCell(rangeVal);
    vCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: fontColor } };
    vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    vCell.alignment = { vertical: 'middle', horizontal: 'center' };
    if (typeof vCell.value === 'number') {
      vCell.numFmt = '#,##0';
    }
  });

  sheet.getRow(4).height = 18;
  sheet.getRow(5).height = 24;
  sheet.getRow(6).height = 10;

  // 3. TIÊU ĐỀ CỘT BẢNG DỮ LIỆU (Dòng 7)
  const headerRow = sheet.getRow(7);
  headerRow.values = [
    'STT',
    'ID Bài viết',
    'Ngày đăng (VN)',
    'Loại bài',
    'Người đăng (Admin/Editor)',
    'Lượt thích',
    'Bình luận',
    'Chia sẻ',
    'Tổng tương tác',
    'Trạng thái',
    'Link Facebook',
    'Trang cá nhân',
    'Nội dung bài viết'
  ];
  headerRow.height = 30;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark Slate
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  // 4. ĐỔ DỮ LIỆU BÀI VIẾT (Từ Dòng 8 trở đi)
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  posts.forEach((p, idx) => {
    const rowIdx = 8 + idx;
    const row = sheet.getRow(rowIdx);

    const isEven = idx % 2 === 1;
    const bgRowColor = isEven ? 'FFF8FAFC' : 'FFFFFFFF'; // Zebra Striping

    let statusText = 'Chờ quét';
    let statusBg = 'FFFEF9C3'; // Vàng nhạt
    let statusColor = 'FFA16207';

    if (p.publisher_status === 'FOUND') {
      statusText = 'Đã xác định';
      statusBg = 'FFDCFCE7'; // Xanh lá nhạt
      statusColor = 'FF15803D';
    } else if (p.publisher_status === 'NOT_FOUND') {
      statusText = 'Chưa nhận diện';
      statusBg = 'FFF1F5F9'; // Xám nhạt
      statusColor = 'FF475569';
    } else if (p.publisher_status === 'LOGIN_REQUIRED') {
      statusText = 'Hết phiên FB';
      statusBg = 'FFFEE2E2';
      statusColor = 'FFB91C1C';
    } else if (p.publisher_status === 'POST_UNAVAILABLE') {
      statusText = 'Không khả dụng';
      statusBg = 'FFFEE2E2';
      statusColor = 'FFB91C1C';
    } else if (p.publisher_status === 'ERROR') {
      statusText = 'Lỗi kết nối';
      statusBg = 'FFFEE2E2';
      statusColor = 'FFB91C1C';
    }

    const postTypeText = p.post_type === 'SHARED' ? 'Chia sẻ' : 'Tự đăng';
    const likes = p.likes_count || 0;
    const comments = p.comments_count || 0;
    const shares = p.shares_count || 0;
    const itemTotalEng = likes + comments + shares;

    row.values = [
      idx + 1,
      p.id,
      formatVNDate(p.created_time),
      postTypeText,
      p.publisher_name || 'Chưa xác định',
      likes,
      comments,
      shares,
      itemTotalEng,
      statusText,
      p.permalink_url ? { text: 'Mở bài viết ↗', hyperlink: getCanonicalPostUrl(p) || p.permalink_url } : '',
      p.publisher_profile_url ? { text: 'Xem Profile ↗', hyperlink: p.publisher_profile_url } : '',
      p.message || ''
    ];

    row.height = 24;

    // Định dạng từng ô
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgRowColor } };
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1E293B' } };

      // STT
      if (colNumber === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF64748B' } };
      }
      // ID
      else if (colNumber === 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF475569' } };
      }
      // Ngày đăng
      else if (colNumber === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      // Loại bài
      else if (colNumber === 4) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (p.post_type === 'SHARED') {
          cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF7E22CE' } };
        } else {
          cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF2563EB' } };
        }
      }
      // Người đăng
      else if (colNumber === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        if (p.publisher_name) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        } else {
          cell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
        }
      }
      // Các cột số tương tác (Likes, Comments, Shares, Tổng tương tác)
      else if (colNumber >= 6 && colNumber <= 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
        if (colNumber === 9) {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFE11D48' } };
        }
      }
      // Trạng thái
      else if (colNumber === 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusBg } };
        cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: statusColor } };
      }
      // Link Facebook
      else if (colNumber === 11 || colNumber === 12) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (cell.value && cell.value.hyperlink) {
          cell.font = { name: 'Segoe UI', size: 9, underline: true, color: { argb: 'FF2563EB' } };
        }
      }
      // Nội dung bài viết
      else if (colNumber === 13) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });
  });

  // Kích hoạt bộ lọc tự động từ tiêu đề dòng 7
  sheet.autoFilter = {
    from: 'A7',
    to: `M${Math.max(7, 7 + posts.length)}`
  };

  // ==========================================================================
  // SHEET 2: THỐNG KÊ XẾP HẠNG NGƯỜI ĐĂNG (PUBLISHER LEADERBOARD)
  // ==========================================================================
  const summarySheet = workbook.addWorksheet('Xếp hạng Quản trị viên', {
    views: [{ state: 'frozen', ySplit: 3, activeCell: 'A4' }]
  });

  summarySheet.columns = [
    { key: 'rank', width: 8 },
    { key: 'name', width: 28 },
    { key: 'count', width: 15 },
    { key: 'percent', width: 16 },
    { key: 'likes', width: 16 },
    { key: 'comments', width: 16 },
    { key: 'shares', width: 16 },
    { key: 'total_eng', width: 18 },
    { key: 'avg_eng', width: 18 }
  ];

  // Tiêu đề Sheet 2
  summarySheet.mergeCells('A1:I1');
  const sumTitle = summarySheet.getCell('A1');
  sumTitle.value = 'BẢNG XẾP HẠNG NĂNG SUẤT & HIỆU QUẢ QUẢN TRỊ VIÊN';
  sumTitle.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo
  sumTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(1).height = 32;

  summarySheet.mergeCells('A2:I2');
  const sumSub = summarySheet.getCell('A2');
  sumSub.value = `Thống kê dựa trên ${posts.length.toLocaleString('vi-VN')} bài viết hiện có trong tập dữ liệu`;
  sumSub.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF475569' } };
  sumSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSub.alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(2).height = 20;

  // Header bảng Sheet 2
  const sumHeader = summarySheet.getRow(3);
  sumHeader.values = [
    'Xếp hạng',
    'Quản trị viên / Người đăng',
    'Số bài đã đăng',
    'Tỷ lệ đóng góp',
    'Tổng lượt thích',
    'Tổng bình luận',
    'Tổng chia sẻ',
    'Tổng tương tác',
    'Tương tác TB / bài'
  ];
  sumHeader.height = 26;
  sumHeader.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder;
  });

  // Gom nhóm thống kê theo publisher từ danh sách posts
  const pubMap = new Map();
  for (const p of posts) {
    if (p.publisher_status === 'FOUND' && p.publisher_name && p.publisher_name.trim()) {
      const name = p.publisher_name.trim();
      const existing = pubMap.get(name) || {
        name,
        count: 0,
        likes: 0,
        comments: 0,
        shares: 0
      };
      existing.count += 1;
      existing.likes += p.likes_count || 0;
      existing.comments += p.comments_count || 0;
      existing.shares += p.shares_count || 0;
      pubMap.set(name, existing);
    }
  }

  const pubList = Array.from(pubMap.values()).sort((a, b) => b.count - a.count);

  pubList.forEach((pub, idx) => {
    const sRowIdx = 4 + idx;
    const sRow = summarySheet.getRow(sRowIdx);
    const pubTotal = pub.likes + pub.comments + pub.shares;
    const avg = pub.count > 0 ? Math.round(pubTotal / pub.count) : 0;
    const sharePct = posts.length > 0 ? (pub.count / posts.length) : 0;

    sRow.values = [
      idx + 1,
      pub.name,
      pub.count,
      sharePct,
      pub.likes,
      pub.comments,
      pub.shares,
      pubTotal,
      avg
    ];
    sRow.height = 24;

    const isTop1 = idx === 0;
    const rowBg = isTop1 ? 'FFFEF3C7' : (idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF');

    sRow.eachCell((cell, colNum) => {
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF0F172A' } };

      if (colNum === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (isTop1) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFD97706' } };
      } else if (colNum === 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
      } else if (colNum === 4) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '0.0%';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
        if (colNum === 8) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE11D48' } };
        }
      }
    });
  });

  summarySheet.autoFilter = {
    from: 'A3',
    to: `I${Math.max(3, 3 + pubList.length)}`
  };

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateExcelReport
};
