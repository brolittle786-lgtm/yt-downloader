// backend/server.js
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Downloads folder create karo
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// ============= VIDEO INFO FETCH KARO =============
app.post('/api/info', (req, res) => {
    const { url } = req.body;
    
    console.log(`📥 Fetching info for: ${url}`);
    
    // yt-dlp se video info lo
    const command = `yt-dlp -j "${url}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'Video info nahi mil paya. Check karo URL sahi hai?' });
        }
        
        try {
            const info = JSON.parse(stdout);
            
            // Available formats nikaalo
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
                .slice(0, 15); // Sirf 15 formats dikhao
    
            res.json({
                title: info.title,
                duration: info.duration,
                thumbnail: info.thumbnail,
                uploader: info.uploader,
                formats: formats
            });
            
        } catch (e) {
            console.error('Parse error:', e);
            res.status(500).json({ error: 'Data parse nahi ho paya' });
        }
    });
});

// ============= DOWNLOAD VIDEO =============
app.post('/api/download', (req, res) => {
    const { url, format_id, title } = req.body;
    
    // Safe filename banao
    const safeTitle = title.replace(/[^\w\s-]/g, '').trim().substring(0, 50);
    const timestamp = Date.now();
    const outputFile = `${safeTitle}_${timestamp}.%(ext)s`;
    const outputPath = path.join(downloadsDir, outputFile);
    
    console.log(`⬇️ Downloading: ${title}`);
    
    // 🔥 IMPORTANT: Yeh command video aur audio ko merge karegi
    let command;
    
    if (format_id.includes('+')) {
        // Already bestvideo+bestaudio hai
        command = `yt-dlp -f "${format_id}" \
            --merge-output-format mp4 \
            -o "${outputPath}" \
            --ffmpeg-location /usr/bin/ffmpeg \
            --no-playlist \
            --quiet \
            "${url}"`;
    } else {
        // Best quality ke liye video+audio alag se uthao
        command = `yt-dlp -f "${format_id}+bestaudio" \
            --merge-output-format mp4 \
            -o "${outputPath}" \
            --ffmpeg-location /usr/bin/ffmpeg \
            --no-playlist \
            --quiet \
            "${url}"`;
    }
    
    exec(command, { maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Download error:', error);
            return res.status(500).json({ error: 'Download failed. Check karo FFmpeg aur yt-dlp installed hain?' });
        }
        
        // Latest file find karo
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

// ============= FILE DOWNLOAD KARO =============
app.get('/api/file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(downloadsDir, filename);
    
    if (fs.existsSync(filepath)) {
        res.download(filepath, filename, (err) => {
            if (!err) {
                // 5 min baad file delete karo (space bachane ke liye)
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

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {



    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Server running on:');
    console.log('   ➜ http://localhost:3000');
    console.log('   ➜ http://' + getLocalIP() + ':3000 (network)');
    console.log('📁 Downloads folder:', downloadsDir);
    console.log('✅ FFmpeg available - Video+Audio merge hoga');
});

// Helper function to get local IP
function getLocalIP() {
    const interfaces = require('os').networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

