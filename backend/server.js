const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

app.post('/api/info', (req, res) => {
    const { url } = req.body;
    
    console.log(`📥 Fetching info for: ${url}`);
    
    const command = `yt-dlp -j "${url}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'Video info nahi mil paya' });
        }
        
        try {
            const info = JSON.parse(stdout);
            
            const formats = info.formats
                .filter(f => f.filesize || f.filesize_approx || (f.height && f.height > 0))
                .map(f => ({
                    format_id: f.format_id,
                    quality: f.format_note || f.format || 'Unknown',
                    resolution: f.height ? `${f.height}p` : 'Audio Only',
                    filesize: f.filesize || f.filesize_approx || 0,
                    ext: f.ext,
                    hasVideo: f.vcodec !== 'none',
                    hasAudio: f.acodec !== 'none'
                }))
                .slice(0, 15);
            
            res.json({
                title: info.title,
                duration: info.duration,
                thumbnail: info.thumbnail,
                uploader: info.uploader,
                views: info.view_count,
                formats: formats
            });
            
        } catch (e) {
            console.error('Parse error:', e);
            res.status(500).json({ error: 'Data parse nahi ho paya' });
        }
    });
});

app.post('/api/download', (req, res) => {
    const { url, format_id, title } = req.body;
    
    const safeTitle = title.replace(/[^\w\s-]/g, '').trim().substring(0, 50);
    const timestamp = Date.now();
    const outputFile = `${safeTitle}_${timestamp}.%(ext)s`;
    const outputPath = path.join(downloadsDir, outputFile);
    
    console.log(`⬇️ Downloading: ${title}`);
    
    let command;
    
    if (format_id.includes('+')) {
        command = `yt-dlp -f "${format_id}" --merge-output-format mp4 -o "${outputPath}" --ffmpeg-location /usr/bin/ffmpeg --no-playlist --quiet "${url}"`;
    } else {
        command = `yt-dlp -f "${format_id}+bestaudio" --merge-output-format mp4 -o "${outputPath}" --ffmpeg-location /usr/bin/ffmpeg --no-playlist --quiet "${url}"`;
    }
    
    exec(command, { maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Download error:', error);
            return res.status(500).json({ error: 'Download failed. Check FFmpeg and yt-dlp' });
        }
        
        const files = fs.readdirSync(downloadsDir)
            .filter(f => f.includes(safeTitle))
            .sort((a, b) => {
                return fs.statSync(path.join(downloadsDir, b)).mtime.getTime() -
                       fs.statSync(path.join(downloadsDir, a)).mtime.getTime();
            });
        
        if (files.length > 0) {
            const filename = files[0];
            res.json({ 
                success: true, 
                file: filename,
                message: '✅ Download complete! FFmpeg ne video+audio merge kar diya'
            });
        } else {
            res.json({ success: true, message: 'Download complete!' });
        }
    });
});

app.get('/api/file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(downloadsDir, filename);
    
    if (fs.existsSync(filepath)) {
        res.download(filepath, filename, (err) => {
            if (!err) {
                setTimeout(() => {
                    try {
                        fs.unlink(filepath, () => {});
                    } catch(e) {}
                }, 5 * 60 * 1000);
            }
        });
    } else {
        res.status(404).json({ error: 'File nahi mili' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📁 Downloads folder: ${downloadsDir}`);
    console.log(`✅ FFmpeg available - Video+Audio merge hoga`);
});
