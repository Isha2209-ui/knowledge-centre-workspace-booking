# Knowledge Centre Workspace Booking System

A web-based application for managing and booking cabins and workspaces in the university's Knowledge Centre. The system provides separate booking experiences for students and faculty, along with administrative tools for managing spaces and reservations.

## 📌 Project Overview

The Knowledge Centre Workspace Booking System simplifies workspace reservations by allowing users to browse available spaces, book workspaces, and manage their reservations through a centralized platform.

The application includes separate interfaces for students, faculty, and administrators.

## 🎯 Objectives

- Simplify cabin and workspace booking.
- Provide a centralized view of workspace availability.
- Support different booking rules for students and faculty.
- Prevent overlapping bookings.
- Allow users to manage and track their reservations.
- Provide administrators with workspace and booking management tools.

## ✨ Features

### Student and Faculty
- User authentication.
- Browse available workspaces.
- View workspace availability.
- Create and manage bookings.
- View personal bookings.
- Cancel reservations.
- Access booking notifications.

### Administrator
- Administrative dashboard.
- Workspace and booking management.
- Overview of booking activity.

### Booking Management
- Role-based booking rules.
- Booking status management.
- Prevention of conflicting reservations.
- Database-backed reservation records.

## 🛠️ Technology Stack

### Frontend
- React
- TypeScript
- Vite
- CSS

### Backend
- Node.js
- Express
- TypeScript

### Database and ORM
- PostgreSQL
- Prisma ORM

### Authentication and Validation
- JSON Web Tokens (JWT)
- bcryptjs
- Zod

### Testing
- Selenium WebDriver
- API integration tests

## 📂 Project Structure

```text
kc-booking/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── routes/
│   │   ├── app.ts
│   │   ├── booking.ts
│   │   ├── db.ts
│   │   └── index.ts
│   └── package.json
│
├── .gitignore
├── PROJECT_STATUS.md
└── README.md
```

## ⚙️ Prerequisites

Install the following before running the project:

- Node.js and npm
- PostgreSQL
- Git

## 🚀 Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/Isha2209-ui/knowledge-centre-workspace-booking.git
```

### 2. Navigate to the project directory

```bash
cd knowledge-centre-workspace-booking
```

### 3. Install frontend dependencies

```bash
cd client
npm install
```

### 4. Install backend dependencies

Open a second terminal from the project root and run:

```bash
cd server
npm install
```

### 5. Configure environment variables

Create a `.env` file inside the `server` directory and configure the database connection and other required environment variables according to the backend configuration.

**Important:** Never commit `.env` files, database passwords, JWT secrets, or other sensitive credentials to GitHub.

### 6. Configure the database

Ensure PostgreSQL is running and the database connection is configured correctly.

Run the Prisma commands required by the project setup to apply database migrations and generate the Prisma client.

### 7. Start the backend

From the `server` directory, run the development command defined in `server/package.json`.

For example, if the package script is named `dev`:

```bash
npm run dev
```

### 8. Start the frontend

From the `client` directory, run:

```bash
npm run dev
```

Open the local URL printed by Vite in your browser.

**Note:** Exact environment variables, database commands, and startup scripts depend on the project's configuration files.

## 🧪 Testing

The project includes API testing and browser-level testing using Selenium WebDriver.

Testing focuses on:

- Authentication and role-based access.
- Workspace browsing.
- Booking creation and cancellation.
- Booking conflict prevention.
- Student, faculty, and administrator workflows.

## 🔒 Security

- Environment files are excluded through `.gitignore`.
- Password hashing is supported through bcryptjs.
- JWT-based authentication is used.
- Input validation is