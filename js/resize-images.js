const { createClient } = supabase;

const client = createClient(
  'https://cwepoklweabvpmyfizto.supabase.co',
  'sb_publishable_3M_jMfBkVJdZNVypnV51ig_oYsn6-0n'
);

async function resizeAllImages() {
  const bucket = "costume-images";

  // ルートの画像一覧取得
  const { data: files, error } = await supabase.storage
    .from(bucket)
    .list("", { limit: 1000 });

  if (error) {
    console.error(error);
    return;
  }

  for (const file of files) {
    if (!file.name.match(/\.(jpg|jpeg|png|webp)$/i)) continue;

    console.log("処理中:", file.name);

    // ダウンロード
    const { data: blob } = await supabase.storage
      .from(bucket)
      .download(file.name);

    const img = await createImageBitmap(blob);

    // リサイズ
    const max = 1600;
    const scale = Math.min(max / img.width, max / img.height, 1);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const resizedBlob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );

    // 上書きアップロード
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(file.name.replace(/\.(png|jpg|jpeg|webp)$/i, ".jpg"), resizedBlob, {
        upsert: true,
        contentType: "image/jpeg",
      });

    if (uploadError) {
      console.error(file.name, uploadError);
    } else {
      console.log("完了:", file.name);
    }
  }

  alert("すべて完了");
}