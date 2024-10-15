const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');  // เพิ่ม express-session

const app = express();

// ตั้งค่า session
app.use(session({
    secret: 'your_secret_key',  // ควรเปลี่ยนเป็นคีย์ลับจริง
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  // กำหนด secure เป็น false สำหรับการทดสอบใน localhost
}));

// ตั้งค่า EJS เป็น view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// เสิร์ฟไฟล์ static
app.use(express.static(path.join(__dirname, 'public')));

// เพิ่ม middleware เพื่อดึงข้อมูลจากฟอร์ม
app.use(express.urlencoded({ extended: true }));

// ตั้งค่าการเชื่อมต่อ PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'student_records',
    password: '123456',
    port: 5432,
});

// Middleware สำหรับตรวจสอบว่าผู้ใช้เข้าสู่ระบบหรือไม่
function checkAuth(req, res, next) {
    if (req.session.userId) {
        // ถ้าผู้ใช้เข้าสู่ระบบแล้ว ให้ไปยังขั้นตอนถัดไป
        next();
    } else {
        // ถ้าผู้ใช้ยังไม่ได้เข้าสู่ระบบ ให้ไปที่หน้า login
        res.redirect('/login');
    }
}

// เส้นทางหลัก (ต้องเข้าสู่ระบบก่อน)
app.get('/', checkAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM student ORDER BY id');  // Query ข้อมูลนักเรียนจากฐานข้อมูล
        const students = result.rows;  // ดึงผลลัพธ์ทั้งหมดออกมา

        // ส่งข้อมูลไปยังหน้า index.ejs
        res.render('index', { students });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// เส้นทางสำหรับหน้า login
app.get('/login', (req, res) => {
    res.render('login');  // เรนเดอร์ไฟล์ login.ejs
});

app.get('/register', (req, res) => {
    res.render('register');  // เรนเดอร์ไฟล์ register.ejs
});

// เส้นทางสำหรับการรับข้อมูลการลงทะเบียน (POST)
app.post('/register', async (req, res) => {
    const { prefix_id, first_name, last_name, date_of_birth, sex, curriculum_id, previous_school, address, telephone, email, line_id, status, username, password, confirmPassword } = req.body;

    // ตรวจสอบว่ารหัสผ่านและยืนยันรหัสผ่านตรงกันหรือไม่
    if (password !== confirmPassword) {
        return res.send('Passwords do not match');
    }

    // เข้ารหัสรหัสผ่านก่อนบันทึก
    const hashedPassword = await bcrypt.hash(password, 10);

    // บันทึกข้อมูลผู้ใช้และข้อมูลนักเรียนลงในฐานข้อมูล
    try {
        // เพิ่มข้อมูลในตาราง student
        const studentResult = await pool.query(
            'INSERT INTO student (prefix_id, first_name, last_name, date_of_birth, sex, curriculum_id, previous_school, address, telephone, email, line_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
            [prefix_id, first_name, last_name, date_of_birth, sex, curriculum_id, previous_school, address, telephone, email, line_id, status]
        );
        const student_id = studentResult.rows[0].id;

        // เพิ่มข้อมูลในตาราง users และเชื่อมโยงกับ student_id
        await pool.query(
            'INSERT INTO users (username, email, password, student_id) VALUES ($1, $2, $3, $4)',
            [username, email, hashedPassword, student_id]
        );

        res.send('Registration successful!');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// เส้นทางสำหรับ login (POST)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

        if (result.rows.length > 0) {
            const user = result.rows[0];

            // เปรียบเทียบรหัสผ่าน
            const match = await bcrypt.compare(password, user.password);

            if (match) {
                // บันทึก userId ลงใน session
                req.session.userId = user.id;
                console.log('Login successful, session ID:', req.session.userId); // เพิ่มการ debug
                res.redirect('/');
            } else {
                console.log('Invalid password'); // เพิ่มการ debug
                res.send('Invalid password');
            }
        } else {
            console.log('User not found'); // เพิ่มการ debug
            res.send('User not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// เส้นทางสำหรับ logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.get('/', checkAuth, async (req, res) => {
    const userId = req.session.userId;

    // ตรวจสอบว่ามี userId ใน session หรือไม่
    console.log('Session userId:', userId);

    if (!userId) {
        return res.status(401).send('Unauthorized: No session userId found');
    }

    try {
        const result = await pool.query(`
            SELECT s.*, u.username, u.email 
            FROM student s 
            JOIN users u ON s.id = u.student_id 
            WHERE u.id = $1
        `, [userId]);
        
        if (result.rows.length > 0) {
            const userData = result.rows[0];
            console.log(userData);
        
             res.render('index', { 
                fn: userData.first_name, 
                ls: userData.last_name,
            });
        
        

        } else {
            res.status(404).send('User not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});



// เริ่มเซิร์ฟเวอร์
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
