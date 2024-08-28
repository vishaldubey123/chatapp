const corsOptions ={
    origin: [
        "https://chatapp-frontend-lac.vercel.app",
        "http://localhost:4173",
        process.env.CLIENT_URL
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}

const CHATKARO_TOKEN = "chatkaro-token"

export { corsOptions, CHATKARO_TOKEN };