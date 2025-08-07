import { Page, Layout, Card, TextContainer, Text, Button, TextField, FormLayout } from "@shopify/polaris";
import emailjs from '@emailjs/browser';
import { useState, useEffect } from "react";

export default function SupportPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    emailjs.init('fblX3wHyg8d2-hMLp'); // Public key
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    emailjs
      .send(
        'service_yhxychf', // Service ID
        'template_6qumglk', // Template ID
        {
          from_email: email,
          subject: subject,
          message: message,
        }
      )
      .then(
        () => {
          setStatus('Message sent successfully!');
          setEmail('');
          setSubject('');
          setMessage('');

        },
        (error) => {
          setStatus('Failed to send message. Try again.');
          console.error('FAILED...', error.text);
        }
      );
  };

  return (
    <Page title="Support">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Text variant="headingMd" as="h2">
              Need help?
            </Text>
            <Text as="p" color="subdued">
              We're here to help! You can reach out through the form below or send us an email.
            </Text>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Send us a message" sectioned>
            <FormLayout>
              <TextField
                label="Your Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
              <TextField
                label="Subject"
                value={subject}
                onChange={setSubject}
                autoComplete="off"
              />
              <TextField
                label="Message"
                value={message}
                onChange={setMessage}
                multiline={4}
              />
              <Button primary onClick={handleSubmit}>
                Send
              </Button>
              {status && <Text color="success">{status}</Text>}
            </FormLayout>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

