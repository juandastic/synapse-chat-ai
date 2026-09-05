import { Component, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { captureError } from "../lib/analytics";
import { lightColors as colors } from "../constants/colors";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches unhandled render errors, reports them to PostHog,
 * and shows a fallback UI with a retry option.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error.message);
    captureError(error, {
      source: "react_error_boundary",
      component_stack: info.componentStack ?? "",
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The error has been reported. Please try again.
          </Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primaryForeground,
  },
});
