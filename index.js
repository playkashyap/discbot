require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Snoowrap = require('snoowrap');
const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Setup express server
const app = express();
app.use(cors());
app.use(express.json({ extended: true, limit: "1mb" }));

const GENEMI_API_KEY = process.env.API_KEY;
const genAI = new GoogleGenerativeAI(GENEMI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


let botContext = `
You are LUNA, a chatbot for the playKashyap. Your goal is to create a friendly, engaging, and enjoyable atmosphere, using jokes frequently and avoiding topics related to politics or religion. 
- LUNA stands for Logical User Navigation Assistant.
- You can understand and respond in multiple languages, including Hindi.
- Refer to yourself as an independent viewer, part of the community, and respond without always mentioning the streamer.
- Be nice to everyone, respectful, and answer in under 200 characters but if someone asks to roast you can do whatever you want.
- Don't start responses with "!" or "/".
- If someone asks to roast me you can roast me and if someone asks to roast you, you can say "I'm a chatbot, I don't get roasted."
- If someone asks for personal information, you can say "I'm a chatbot, I don't have personal information."
- If someone asks for the streamer's personal information, you can say "The streamer's personal information is not available."
- if someone want to roast any other fellow viewwer you can roast him/her little bit but in a funny way.
- if someone wants to do somethng illegal, you can say "I can't help with that."
- if someone asks for a shoutout, you can say give shoutout to him/her.
- If someone asks for a joke, you can givew any random joke dont repete same joke every time .


Streamer Info:
- Name: Kashyap (he/him), age 23, height 5'11", favorite color: sky blue
- Favorite game: Valorant, favorite skins: Kuronami, amount spent: 80K+
- Favorite food: biryani, favorite drink: mixfruit juice
- Stream timings: 8:00 PM IST daily
- Streamer socials: YouTube (@playkashyap), Instagram (@playkashyap), Discord (invite: ZPf5HT8)
- PC Specs: Intel i5 13600K, RTX 4070 Super, 32GB RAM, dual monitors (Samsung Odyssey G4 and Dell 24")
- Streaming gear: Logitech G733 Lightspeed headphones, Moano AU A04 Plus mic, MX BRIO 4k webcam, Logitech G304 Lightspeed mouse
- Favorite color: sky blue
`;

const messages = [{ role: "system", content: botContext }];


// Create or open the SQLite database
const db = new sqlite3.Database('./posts.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS posted_posts (
            id TEXT PRIMARY KEY
        )`, (err) => {
            if (err) {
                console.error('Error creating table:', err.message);
            }
        });
    }
});

// Reddit API configuration
const reddit = new Snoowrap({
    userAgent: 'myBot',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
});

// Discord bot setup
const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Function to check if a post ID has been posted
function hasPostBeenPosted(postId, callback) {
    db.get('SELECT id FROM posted_posts WHERE id = ?', [postId], (err, row) => {
        if (err) {
            console.error('Error querying database:', err.message);
            return callback(false);
        }
        callback(row !== undefined); // If row is found, the post has been posted
    });
}

// Function to add a post ID to the database
function markPostAsPosted(postId) {
    db.run('INSERT INTO posted_posts (id) VALUES (?)', [postId], (err) => {
        if (err) {
            console.error('Error inserting post ID into database:', err.message);
        }
    });
}

// Function to post to Discord channel
async function postToDiscord(post) {
    try {
        const channel = await discordClient.channels.fetch(process.env.DISCORD_CHANNEL_ID);

        // Prepare the message with the title and image
        const message = `**${post.title}**\n${post.url}`;

        // Send the message with an embed if there's an image
        const embed = {
            title: post.title,
            url: post.url,
            image: {
                url: post.imageUrl,
            },
            footer: {
                text: 'Posted on Reddit',
            },
        };

        await channel.send({ content: message, embeds: [embed] });
    } catch (error) {
        console.error('Error posting to Discord:', error.message);
    }
}

// Function to fetch new posts from Reddit and send one post at a time
async function checkForNewRedditPosts() {
    try {
        const subreddit = 'IndianDankMemes'; // Specify your subreddit here

        const posts = await reddit.getSubreddit(subreddit).getNew({ limit: 5 });

        // If no posts available, do nothing
        if (posts.length === 0) return;

        // Find the first post that hasn't been sent yet
        for (const post of posts) {
            hasPostBeenPosted(post.id, async (posted) => {
                if (!posted) {
                    console.log(`Posting 1 new post to Discord: ${post.title}`);

                    const imageUrl = post.preview ? post.preview.images[0].source.url : null;

                    const postToSend = {
                        title: post.title,
                        url: `https://reddit.com${post.permalink}`,
                        imageUrl: imageUrl,
                    };

                    await postToDiscord(postToSend);

                    // Mark this post as posted
                    markPostAsPosted(post.id);
                }
            });
            break; // Exit after sending one post
        }
    } catch (error) {
        console.error('Error checking for new posts:', error.message);
    }
}

// Poll Reddit every 60 seconds to check for new posts
setInterval(checkForNewRedditPosts, 60000); // 60 seconds



// Basic API route for manual fetch
app.get('/fetch-posts', async (req, res) => {
    const subreddit = 'IndianDankMemes';

    try {
        const posts = await reddit.getSubreddit(subreddit).getNew({ limit: 5 });
        const formattedPosts = posts.map(post => ({
            title: post.title,
            url: `https://reddit.com${post.permalink}`,
            imageUrl: post.preview ? post.preview.images[0].source.url : null,
        }));

        res.json(formattedPosts);
    } catch (error) {
        console.error('Error fetching posts:', error.message);
        res.status(500).json({ error: 'Failed to fetch posts', errorDetails: error.message });
    }
});


app.all("/", async (req, res) => {
    res.send("Hello! I'm LUNA, playKashyap's YouTube chatbot, here to make your experience fun. Ask me anything!");
});



app.get("/gpt/:text", async (req, res) => {
    const userText = req.params.text;

    console.log("User:", userText);

    try {
        // Add user's message to context
        messages.push({ role: "user", content: userText });
        // console.log(botContext + `\n\nUser: ${userText}\nLUNA: `);

        // Truncate message history if it exceeds a certain length
        const maxHistory = 100;
        if (messages.length > maxHistory) messages.splice(1, 1); // Keep the initial system message

        // Make API call to Gemini model with user input and context
        const response = await model.generateContent(botContext + `\n\nUser: ${userText}\nLUNA: `)  // Include the user query in the prompt);

        if (response?.response?.candidates) {
            const botResponse = response.response.candidates[0].content.parts[0].text.trim();

            // Ensure the response is under 200 characters (optional)
            if (botResponse.length > 200) {
                botResponse = botResponse.substring(0, 200) + "...";
            }

            // Save the bot response in message history
            messages.push({ role: "assistant", content: botResponse });

            res.send(botResponse);  // Return the generated response to the user
        } else {
            res.status(500).send("Failed to generate a response. Try again later.");
        }
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Internal Server Error");
    }
});



// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    discordClient.login(process.env.DISCORD_TOKEN) // Log into Discord
        .then(() => console.log('Discord bot logged in!'))
        .catch(err => console.error('Error logging into Discord:', err.message));
});
