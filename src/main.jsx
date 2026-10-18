import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import Typography from '@mui/material/Typography';
import createTheme from '@mui/material/styles/createTheme';
import '../assets/auth.css';

const theme = createTheme({
  palette: { primary: { main: '#4968e8' }, text: { primary: '#1b2638', secondary: '#7b8798' } },
  typography: { fontFamily: '"DM Sans", Arial, sans-serif', button: { textTransform: 'none', fontWeight: 700 } },
  shape: { borderRadius: 10 },
  components: {
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: '#fff' }, notchedOutline: { borderColor: '#dfe5ee' } } },
    MuiButton: { defaultProps: { disableElevation: true } }
  }
});

const logo = 'https://www.electroautomacao.com.br/wp-content/uploads/2019/07/logo-electro-3-300x86.png';

function Brand({ mobile = false }) {
  return <Box component={mobile ? 'div' : 'a'} href={mobile ? undefined : '#'} className={mobile ? 'auth-mobile-brand' : 'auth-brand'} aria-label="Painel Studio da Electro Automação">
    <img className="electro-logo" src={logo} alt="Electro Automação Industrial" />
    <span className="auth-brand-divider" aria-hidden="true" />
    <span>Painel Studio</span>
  </Box>;
}

function Blueprint() {
  return <Box className="auth-blueprint" aria-hidden="true">
    <span className="blueprint-measure measure-x">600 mm</span>
    <Box className="blueprint-board"><i /><i /><i /><i /><i /><b /><b /><b /></Box>
    <span className="blueprint-measure measure-y">800 mm</span>
    <span className="blueprint-label">QD-01 · LAYOUT 2D</span>
  </Box>;
}

function AuthView() {
  return <Box component="section" className="auth-screen" id="loginView" aria-labelledby="authTitle">
    <Paper className="auth-shell" elevation={0}>
      <Box component="section" className="auth-intro">
        <div className="auth-motion" aria-hidden="true">
          <span className="motion-orbit orbit-one" /><span className="motion-orbit orbit-two" />
          <span className="motion-node node-one" /><span className="motion-node node-two" /><span className="motion-node node-three" />
          <span className="motion-trace trace-one" /><span className="motion-trace trace-two" /><span className="motion-trace trace-three" />
          <span className="motion-spark spark-one" /><span className="motion-spark spark-two" />
        </div>
        <Brand />
        <Box className="auth-copy">
          <div className="auth-eyebrow"><span /> PROJETO DE PAINÉIS ELÉTRICOS</div>
          <Typography component="h1">Seu próximo painel começa aqui.</Typography>
          <Typography component="p">Organize componentes, dimensões e layouts em um espaço de trabalho feito para seus projetos.</Typography>
        </Box>
        <Blueprint />
        <Typography component="p" className="auth-footnote">Projetos organizados por perfil, com acesso de qualquer computador.</Typography>
      </Box>

      <Box component="section" className="auth-panel">
        <Box className="auth-form-wrap">
          <Brand mobile />
          <div className="auth-eyebrow">ÁREA DE TRABALHO</div>
          <Typography component="h2" id="authTitle">Boas-vindas de volta</Typography>
          <Typography component="p" id="authSubtitle" className="auth-subtitle">Entre na sua conta para acessar seus projetos.</Typography>
          <Stack className="auth-tabs" direction="row" role="tablist" aria-label="Acesso à conta">
            <Button className="auth-tab active" id="signInTab" type="button" role="tab" aria-selected="true">Entrar</Button>
            <Button className="auth-tab" id="signUpTab" type="button" role="tab" aria-selected="false">Criar conta</Button>
          </Stack>
          <Box component="form" id="authForm" noValidate>
            <Box className="auth-field" id="nameField" hidden>
              <Typography component="label" htmlFor="authName">Nome</Typography>
              <TextField id="authName" fullWidth size="small" placeholder="Como podemos chamar você?" autoComplete="name" />
            </Box>
            <Box className="auth-field" id="emailField">
              <Typography component="label" htmlFor="authEmail">E-mail ou nome de login</Typography>
              <TextField id="authEmail" fullWidth size="small" type="text" placeholder="voce@empresa.com ou usuario" autoComplete="username" required />
            </Box>
            <Box className="auth-field" id="usernameField" hidden>
              <Typography component="label" htmlFor="authUsername">Nome de login</Typography>
              <TextField id="authUsername" fullWidth size="small" type="text" placeholder="ex.: danilo.silva" autoComplete="username" inputProps={{ minLength: 3, maxLength: 32, pattern: '[a-z0-9][a-z0-9._-]{2,31}', autoCapitalize: 'none', spellCheck: false }} />
              <Typography component="span" className="auth-field-hint">Sem espaços; use letras minúsculas, números, ponto, hífen ou sublinhado.</Typography>
            </Box>
            <Box className="auth-field" id="passwordField">
              <Typography component="label" htmlFor="authPassword" id="passwordLabel">Senha</Typography>
              <TextField id="authPassword" fullWidth size="small" type="password" placeholder="Digite sua senha" autoComplete="current-password" required inputProps={{ minLength: 8 }}
                InputProps={{ endAdornment: <InputAdornment position="end"><Button className="auth-password-toggle" id="togglePassword" type="button" aria-label="Mostrar senha" aria-pressed="false">Mostrar</Button></InputAdornment> }} />
            </Box>
            <Stack className="auth-form-meta" direction="row" justifyContent="space-between" alignItems="center">
              <Typography component="span" id="passwordHint">Use sua senha do Painel Studio.</Typography>
              <Button className="auth-text-button" id="forgotPassword" type="button">Esqueci minha senha</Button>
            </Stack>
            <Button className="auth-submit" id="authSubmit" type="submit" fullWidth variant="contained"><span>Entrar</span><span aria-hidden="true">→</span></Button>
          </Box>
          <Paper className="demo-access" elevation={0} aria-label="Dados de login para demonstração">
            <Box className="demo-access-heading">
              <span className="demo-access-dot" aria-hidden="true" />
              <Typography component="span">ACESSO DE DEMONSTRAÇÃO</Typography>
            </Box>
            <Stack className="demo-access-values" direction="row" spacing={1}>
              <Box className="demo-access-value"><span>Login</span><strong>visitante</strong></Box>
              <Box className="demo-access-value"><span>Senha</span><strong>visitante</strong></Box>
            </Stack>
          </Paper>
          <Box className="auth-message" id="authMessage" role="status" aria-live="polite" hidden />
          <Box className="auth-setup" id="authSetup" hidden>
            <strong>Conecte o Supabase para ativar as contas.</strong>
            <span>Preencha a URL do projeto e a chave pública em <code>assets/supabase-config.js</code> e aplique o esquema SQL descrito no README.</span>
          </Box>
          <Stack className="auth-privacy" direction="row" alignItems="center" justifyContent="center" spacing={0.75}>
            <span className="auth-lock" aria-hidden="true">◈</span> Seus projetos ficam associados à sua conta.
          </Stack>
        </Box>
      </Box>
    </Paper>
  </Box>;
}

const root = createRoot(document.getElementById('auth-root'));
flushSync(() => root.render(<ThemeProvider theme={theme}><CssBaseline /><AuthView /></ThemeProvider>));
document.dispatchEvent(new Event('panel-studio-auth-ready'));
