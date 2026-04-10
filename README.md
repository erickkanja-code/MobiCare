# MobiCare

A mobile-first web application for Community Health Workers in Rwanda to manage patient records and track home visits. Works fully offline and syncs data when internet is available.

---

## Requirements

Before you start, make sure you have the following installed on your computer:

- Node.js version 18 or newer — download from https://nodejs.org
- Git — download from https://git-scm.com

To confirm they are installed, open your terminal and run:

node -v
git --version

Both commands should print a version number. If either gives an error, install the missing one before continuing.

---

## Getting the project

Clone the repository to your computer:

git clone https://github.com/erickkanja-code/MobiCare.git

Navigate into the project folder:

cd MobiCare

---

## Installing dependencies

Run the following command:

npm install --legacy-peer-deps

This will download all the packages the project needs. It may take a minute.

---

## Running the app locally

Once installation is complete, start the development server:

npm run dev

Then open your browser and go to:

http://localhost:3000

---

## Logging in

The app includes a demo account for testing:

Email: alice@mobicare.rw
Password: password123

---

## What you can do in the app

- View the dashboard showing today's visits and overdue cases
- Browse and search the patient list
- Add and edit patient records
- Schedule visits for patients
- Log completed visits with notes and vital signs
- Upload photos during a visit log
- Use the app with no internet connection — all data is saved locally and syncs automatically when you go back online

---

## Offline mode

The app is designed to work without an internet connection. All data is stored in your browser's local database. To test this:

1. Open the app and log in
2. Turn off your internet connection or enable airplane mode
3. Add a patient or log a visit — it will still work
4. Turn your internet back on
5. The sync indicator in the top right of the app will update and push your changes

---

## Deploying to Vercel

To host the frontend online:

1. Push the repository to GitHub if you have not already
2. Go to https://vercel.com and sign in with your GitHub account
3. Click "Add New Project" and import this repository
4. Vercel will detect it as a Vite project automatically
5. Click Deploy
6. Vercel will give you a public URL you can share and open on any device

No environment variables are needed for the frontend-only deployment.

---

## Project structure

MobiCare/
├── index.html          
├── package.json        
├── vite.config.js      
├── src/
│   ├── App.jsx          
│   └── main.jsx         
├── public/
│   ├── manifest.json    
│   └── sw.js            
└── backend/
    ├── server.js        
    └── package.json     

The backend folder contains an Express API and PostgreSQL setup for production use. It is not required to run the app locally or for a demo — the app works fully without it using browser storage.

---

## Backend setup (optional)

Only follow these steps if you want to connect a real database and sync data across multiple devices.

Requirements:
- A PostgreSQL database
- A Firebase project with Authentication and Storage enabled

1. Navigate to the backend folder:

cd backend

2. Install backend dependencies:

npm install

3. Create a file called .env inside the backend folder with the following:

DATABASE_URL=postgresql://youruser:yourpassword@localhost:5432/mobicare
FIREBASE_SERVICE_ACCOUNT=paste the contents of your Firebase service account JSON here as a single line
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FRONTEND_URL=http://localhost:3000
PORT=3001

4. Start the backend server:

node server.js

The API will run on http://localhost:3001

---

## Troubleshooting

npm install fails with a peer dependency error
Run npm install --legacy-peer-deps instead of npm install

The app opens but shows a blank page
Make sure you are in the correct folder. The index.html file should be at the root of the project, not inside any subfolder.

Port 3000 is already in use
Open vite.config.js and change port: 3000 to any other number such as 3001, then run npm run dev again.

Changes not showing after git push to Vercel
Go to your Vercel dashboard, open the project, and manually trigger a new deployment.
