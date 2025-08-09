import { useState } from 'react';
import { Mail, User, CheckCircle, Building2, Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateLeadForm, ValidationError } from '@/lib/validation';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { error } from 'console';

export const LeadCaptureForm = () => {
  const [formData, setFormData] = useState({ name: '', email: '', industry: '' });
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [leads, setLeads] = useState<
    Array<{ name: string; email: string; industry: string; submitted_at: string }>
  >([]);

  const getFieldError = (field: string) => {
    return validationErrors.find(error => error.field === field)?.message;
  };

  const getErrorMessage = (err: unknown, fallbackMessage: string = 'Unexpected error occurred.') => {
    const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : undefined;
    return message || fallbackMessage;
  };

  // Types
  type LeadInput = { name: string; email: string; industry: string };

  // Helper: Save lead to Supabase
  const saveLead = async (data: LeadInput): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('leads').insert([
        { name: data.name, email: data.email, industry: data.industry },
      ]);
      if (error) {
        return { success: false, error: error.message || 'Failed to save lead.' };
      }
      return { success: true };
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Unexpected error while saving lead.');
      return { success: false, error: message };
    }
  };

  // Helper: Send confirmation email (non-critical)
  const sendConfirmationEmail = async (data: LeadInput): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.functions.invoke('send-confirmation', {
        body: { name: data.name, email: data.email, industry: data.industry },
      });
      if (error) {
        return { success: false, error: error.message || 'Failed to send confirmation email.' };
      }
      return { success: true };
    } catch (err: unknown) {
      console.log("Error sending confirmation email:11", err);
      const message = getErrorMessage(err, 'Unexpected error while sending email.');
      return { success: false, error: message };
    }
  };

  const resendEmail = async () => {
    if (!leads.length) return;
    setIsResendingEmail(true);
    setEmailError(null);
    const lastLead = leads[leads.length - 1];
    try {
      const result = await sendConfirmationEmail({ name: lastLead.name, email: lastLead.email, industry: lastLead.industry });
      if (!result.success) {
        setEmailError(result.error || 'Still unable to send the confirmation email.');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Unexpected error while resending email.');
      setEmailError(message);
    } finally {
      setIsResendingEmail(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Reset previous errors (not form state)
    setLeadError(null);
    setEmailError(null);

    const errors = validateLeadForm(formData);
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setIsSubmitting(true);

    try {
      // 1. Save lead (critical)
      const saveResult = await saveLead(formData);
      if (!saveResult.success) {
        setLeadError(saveResult.error || 'Failed to save your information. Please try again.');
        return;
      }

      // 2. Send confirmation email (non-critical)
      const emailResult = await sendConfirmationEmail(formData);
      if (!emailResult.success) {
        setEmailError(emailResult.error || 'We could not send a confirmation email right now.');
      }

      // 3. Mark success and store in local state.
      const lead = {
        name: formData.name,
        email: formData.email,
        industry: formData.industry,
        submitted_at: new Date().toISOString(),
      };
      setLeads(prev => [...prev, lead]);
      setSubmitted(true);
      setFormData({ name: '', email: '', industry: '' });
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Unexpected error occurred.');
      setLeadError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors.some(error => error.field === field)) {
      setValidationErrors(prev => prev.filter(error => error.field !== field));
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-gradient-card p-8 rounded-2xl shadow-card border border-border backdrop-blur-sm animate-slide-up text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center mx-auto shadow-glow animate-glow">
              <CheckCircle className="w-10 h-10 text-primary-foreground" />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-foreground mb-3">Welcome aboard {leads[leads.length - 1].name}! 🎉</h2>

          <p className="text-muted-foreground mb-2">
            Thanks for joining! We'll be in touch soon with updates.
          </p>

          <p className="text-sm text-accent mb-8">
            You're #{leads.length} in this session
          </p>

          {emailError && (
            <Alert variant="default" className="mb-6 text-left border-accent/40 bg-accent/10">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle>Email Pending</AlertTitle>
              <AlertDescription>
                We saved your info, but couldn't send the confirmation email yet.<br />
                <span className="font-medium">Reason:</span> {emailError}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" disabled={isResendingEmail} onClick={resendEmail} className="flex items-center gap-1">
                    {isResendingEmail && <Loader2 className="w-4 h-4 animate-spin" />}<RefreshCcw className="w-4 h-4" /> Retry Email
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="p-4 bg-accent/10 rounded-lg border border-accent/20">
              <p className="text-sm text-foreground">
                💡 <strong>What's next?</strong>
                <br />
                We'll send you exclusive updates, early access, and behind-the-scenes content as we
                build something amazing.
              </p>
            </div>

            <Button
              onClick={() => setSubmitted(false)}
              variant="outline"
              className="w-full border-border hover:bg-accent/10 transition-smooth group"
            >
              Submit Another Lead
              <User className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Follow our journey on social media for real-time updates
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative bg-gradient-card p-8 rounded-2xl shadow-card border border-border backdrop-blur-sm animate-slide-up">
        {isSubmitting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm rounded-2xl z-20 animate-fade-in">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Submitting...</p>
          </div>
        )}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Mail className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Join Our Community</h2>
          <p className="text-muted-foreground">Be the first to know when we launch</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Accessible live region for submission status */}
          <output className="sr-only" aria-live="polite">
            {isSubmitting ? 'Submitting your information...' : 'Form ready'}
          </output>
          {leadError && (
            <Alert variant="destructive" className="border-destructive/50">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle>Submission Failed</AlertTitle>
              <AlertDescription>
                We couldn't save your information: {leadError}
                <br />Please try again later. If the issue continue, reach out to us to report the problem.
              </AlertDescription>
            </Alert>
          )}
          <div className={isSubmitting ? 'opacity-60 pointer-events-none space-y-6' : 'space-y-6'}>
          <div className="space-y-2">
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Your name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={`pl-10 h-12 bg-input border-border text-foreground placeholder:text-muted-foreground transition-smooth
                  ${getFieldError('name') ? 'border-destructive' : 'focus:border-accent focus:shadow-glow'}
                `}
                disabled={isSubmitting}
              />
            </div>
            {getFieldError('name') && (
              <p className="text-destructive text-sm animate-fade-in">{getFieldError('name')}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className={`pl-10 h-12 bg-input border-border text-foreground placeholder:text-muted-foreground transition-smooth
                  ${getFieldError('email') ? 'border-destructive' : 'focus:border-accent focus:shadow-glow'}
                `}
                disabled={isSubmitting}
              />
            </div>
            {getFieldError('email') && (
              <p className="text-destructive text-sm animate-fade-in">{getFieldError('email')}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
              <Select value={formData.industry} onValueChange={(value) => handleInputChange('industry', value)} disabled={isSubmitting}>
                <SelectTrigger className={`pl-10 h-12 bg-input border-border text-foreground transition-smooth
                  ${getFieldError('industry') ? 'border-destructive' : 'focus:border-accent focus:shadow-glow'}
                `}>
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="retail">Retail & E-commerce</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="consulting">Consulting</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {getFieldError('industry') && (
              <p className="text-destructive text-sm animate-fade-in">{getFieldError('industry')}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-gradient-primary text-primary-foreground font-semibold rounded-lg shadow-glow hover:shadow-[0_0_60px_hsl(210_100%_60%/0.3)] transition-smooth transform hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Get Early Access
              </>
            )}
          </Button>
          </div>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6">
          By submitting, you agree to receive updates. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
};
